import type { Logger } from '@listinglogic/logger';
import type { IsoTimestamp, OperatorId } from '@listinglogic/types';
import type {
  CollectionReference,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  Transaction,
  WriteBatch,
} from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

import { getDb } from './client.js';
import { Fields } from './collections.js';
import { createConverter, type WithId } from './converters.js';
import { DatabaseError, ForbiddenError, NotFoundError, OptimisticLockError } from './errors.js';

/**
 * Base repository with common patterns:
 *   - Operator isolation enforced on every query
 *   - Optimistic concurrency via `updatedAt` timestamp
 *   - Structured logging with timing
 *   - Automatic conversion between domain types and Firestore
 *
 * Extend this class for each entity repository.
 */

export interface BaseEntity extends WithId {
  readonly operatorId: OperatorId;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export interface ListResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly hasMore: boolean;
}

export interface ListOptions {
  readonly page: number;
  readonly limit: number;
  readonly sortBy: string;
  readonly sortOrder: 'asc' | 'desc';
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected readonly db: Firestore;
  protected readonly collection: CollectionReference<T>;
  protected readonly logger: Logger;
  protected readonly entityName: string;

  constructor(collectionName: string, entityName: string, logger: Logger) {
    this.db = getDb();
    this.collection = this.db
      .collection(collectionName)
      .withConverter(createConverter<T>());
    this.logger = logger.child({ repository: entityName });
    this.entityName = entityName;
  }

  // ─── Read operations ─────────────────────────────────────────────────────

  public async findById(
    operatorId: OperatorId,
    id: string,
    transaction?: Transaction,
  ): Promise<T | null> {
    const start = Date.now();
    try {
      const ref = this.docRef(id);
      const snap = transaction ? await transaction.get(ref) : await ref.get();

      if (!snap.exists) return null;

      const entity = snap.data();
      if (!entity) return null;

      // Defense in depth: verify operator ownership even though Firestore rules check
      if (entity.operatorId !== operatorId) {
        this.logger.warn('Cross-tenant access attempt blocked', {
          requestingOperator: operatorId,
          entityOperator: entity.operatorId,
          entityId: id,
        });
        return null;
      }

      this.logger.debug('findById complete', {
        id,
        durationMs: Date.now() - start,
      });
      return entity;
    } catch (err) {
      throw this.wrapError('findById', err);
    }
  }

  public async findByIdOrThrow(
    operatorId: OperatorId,
    id: string,
    transaction?: Transaction,
  ): Promise<T> {
    const entity = await this.findById(operatorId, id, transaction);
    if (!entity) throw new NotFoundError(this.entityName, id);
    return entity;
  }

  public async list(
    operatorId: OperatorId,
    options: ListOptions,
    queryBuilder?: (query: Query<T>) => Query<T>,
  ): Promise<ListResult<T>> {
    const start = Date.now();
    try {
      let query: Query<T> = this.collection.where(Fields.OPERATOR_ID, '==', operatorId);

      if (queryBuilder) query = queryBuilder(query);
      query = query.orderBy(options.sortBy, options.sortOrder);

      // Firestore count aggregation (no full read)
      const [countSnap, dataSnap] = await Promise.all([
        query.count().get(),
        query
          .offset((options.page - 1) * options.limit)
          .limit(options.limit)
          .get(),
      ]);

      const total = countSnap.data().count;
      const items = dataSnap.docs.map((doc) => doc.data());

      this.logger.debug('list complete', {
        count: items.length,
        total,
        durationMs: Date.now() - start,
      });

      return {
        items,
        total,
        hasMore: options.page * options.limit < total,
      };
    } catch (err) {
      throw this.wrapError('list', err);
    }
  }

  // ─── Write operations ────────────────────────────────────────────────────

  public async create(
    operatorId: OperatorId,
    data: Omit<T, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>,
    transaction?: Transaction,
  ): Promise<T> {
    const start = Date.now();
    const ref = this.collection.doc();
    const now = new Date().toISOString() as IsoTimestamp;

    const entity = {
      ...data,
      id: ref.id,
      operatorId,
      createdAt: now,
      updatedAt: now,
    } as T;

    try {
      if (transaction) {
        transaction.set(ref, entity);
      } else {
        await ref.set(entity);
      }

      this.logger.info(`${this.entityName} created`, {
        id: ref.id,
        durationMs: Date.now() - start,
      });
      return entity;
    } catch (err) {
      throw this.wrapError('create', err);
    }
  }

  public async update(
    operatorId: OperatorId,
    id: string,
    patch: Partial<Omit<T, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>>,
    options?: { readonly expectedUpdatedAt?: IsoTimestamp },
  ): Promise<T> {
    const start = Date.now();
    const ref = this.docRef(id);

    try {
      return await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);

        if (!snap.exists) throw new NotFoundError(this.entityName, id);

        const existing = snap.data();
        if (!existing) throw new NotFoundError(this.entityName, id);

        if (existing.operatorId !== operatorId) {
          throw new ForbiddenError(this.entityName, id);
        }

        // Optimistic concurrency check
        if (
          options?.expectedUpdatedAt &&
          existing.updatedAt !== options.expectedUpdatedAt
        ) {
          throw new OptimisticLockError(this.entityName, id);
        }

        const now = new Date().toISOString() as IsoTimestamp;
        const updated = { ...existing, ...patch, updatedAt: now } as T;

        tx.set(ref, updated);

        this.logger.info(`${this.entityName} updated`, {
          id,
          fieldsChanged: Object.keys(patch),
          durationMs: Date.now() - start,
        });

        return updated;
      });
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ForbiddenError || err instanceof OptimisticLockError) {
        throw err;
      }
      throw this.wrapError('update', err);
    }
  }

  public async delete(operatorId: OperatorId, id: string): Promise<void> {
    const start = Date.now();
    const ref = this.docRef(id);

    try {
      await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);

        if (!snap.exists) throw new NotFoundError(this.entityName, id);

        const existing = snap.data();
        if (!existing) throw new NotFoundError(this.entityName, id);

        if (existing.operatorId !== operatorId) {
          throw new ForbiddenError(this.entityName, id);
        }

        tx.delete(ref);
      });

      this.logger.info(`${this.entityName} deleted`, {
        id,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ForbiddenError) throw err;
      throw this.wrapError('delete', err);
    }
  }

  // ─── Batch operations ────────────────────────────────────────────────────

  public batch(): WriteBatch {
    return this.db.batch();
  }

  public async runTransaction<R>(
    updateFn: (tx: Transaction) => Promise<R>,
  ): Promise<R> {
    return this.db.runTransaction(updateFn);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  protected docRef(id: string): DocumentReference<T> {
    return this.collection.doc(id);
  }

  protected serverTimestamp(): FieldValue {
    return FieldValue.serverTimestamp();
  }

  protected increment(n: number): FieldValue {
    return FieldValue.increment(n);
  }

  protected arrayUnion<V>(...values: V[]): FieldValue {
    return FieldValue.arrayUnion(...values);
  }

  protected arrayRemove<V>(...values: V[]): FieldValue {
    return FieldValue.arrayRemove(...values);
  }

  protected wrapError(operation: string, err: unknown): DatabaseError {
    this.logger.error(`${this.entityName}.${operation} failed`, {
      error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    });
    return new DatabaseError(
      `${this.entityName} ${operation} failed`,
      err,
    );
  }

  protected assertSnapshotExists(snap: DocumentSnapshot<T>, id: string): T {
    if (!snap.exists) throw new NotFoundError(this.entityName, id);
    const data = snap.data();
    if (!data) throw new NotFoundError(this.entityName, id);
    return data;
  }
        }

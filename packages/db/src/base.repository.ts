import { FieldPath, FieldValue } from 'firebase-admin/firestore';

import { getDb } from './client.js';
import { Fields } from './collections.js';
import { createConverter, type WithId } from './converters.js';
import { DatabaseError, ForbiddenError, NotFoundError, OptimisticLockError } from './errors.js';

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

/**
 * Base repository with common patterns:
 *   - Operator isolation enforced on every query
 *   - Optimistic concurrency via `updatedAt` timestamp
 *   - Structured logging with timing
 *   - Automatic conversion between domain types and Firestore
 *   - Cursor-based pagination (see `list()`) — never `.offset()`, which forces
 *     Firestore to read and discard every skipped document server-side.
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
  /**
   * Opaque cursor for fetching the next page — pass back as `ListOptions.cursor`.
   * `null` when there are no more results after this page.
   */
  readonly nextCursor: string | null;
}

export interface ListOptions {
  readonly limit: number;
  readonly sortBy: string;
  readonly sortOrder: 'asc' | 'desc';
  /**
   * Opaque cursor from a previous `ListResult.nextCursor`. Omit (or pass
   * `undefined`) to fetch the first page. Pagination is forward-only by
   * design — see docs/ARCHITECTURE.md § Pagination for the rationale.
   */
  readonly cursor?: string;
}

interface CursorPayload {
  readonly sortValue: unknown;
  readonly id: string;
}

/**
 * Encodes/decodes the opaque pagination cursor. The cursor captures both the
 * sort field's value and the document ID of the last item on the previous
 * page, which Firestore requires as a compound cursor to paginate stably
 * when the sort field has duplicate values across documents.
 */
function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
    if (typeof parsed !== 'object' || parsed === null || !('id' in parsed)) {
      throw new Error('Malformed cursor payload');
    }
    return parsed;
  } catch {
    throw new Error('Invalid pagination cursor');
  }
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

  /**
   * Cursor-paginated list. Uses `startAfter()` instead of `.offset()` so cost
   * and latency are O(limit) regardless of how deep into the result set the
   * caller pages — `.offset(N)` makes Firestore read and discard all N
   * preceding documents server-side on every request, which gets slow and
   * expensive fast once a collection has more than a page or two of data.
   *
   * The trade-off: pagination is forward-only (no "jump to page 50"). Every
   * caller in this codebase only ever needs Prev/Next, so that's a fine
   * trade for how much cheaper this is at scale.
   */
  public async list(
    operatorId: OperatorId,
    options: ListOptions,
    queryBuilder?: (query: Query<T>) => Query<T>,
  ): Promise<ListResult<T>> {
    const start = Date.now();
    try {
      let query: Query<T> = this.collection.where(Fields.OPERATOR_ID, '==', operatorId);

      if (queryBuilder) query = queryBuilder(query);

      // Secondary sort on document ID guarantees a stable total order even
      // when many documents share the same value for `sortBy` — required
      // for cursors to be unambiguous.
      query = query.orderBy(options.sortBy, options.sortOrder).orderBy(FieldPath.documentId(), options.sortOrder);

      if (options.cursor) {
        const { sortValue, id } = decodeCursor(options.cursor);
        query = query.startAfter(sortValue, id);
      }

      // Firestore count aggregation reads only the count, not the documents —
      // O(1)-ish server-side cost regardless of collection size, unlike offset.
      const [countSnap, dataSnap] = await Promise.all([
        query.count().get(),
        query.limit(options.limit).get(),
      ]);

      const total = countSnap.data().count;
      const items = dataSnap.docs.map((doc) => doc.data());

      const lastDoc = dataSnap.docs[dataSnap.docs.length - 1];
      const hasMore = items.length === options.limit && dataSnap.docs.length > 0;
      const nextCursor =
        hasMore && lastDoc
          ? encodeCursor({ sortValue: lastDoc.get(options.sortBy) as unknown, id: lastDoc.id })
          : null;

      this.logger.debug('list complete', {
        count: items.length,
        total,
        durationMs: Date.now() - start,
      });

      return { items, total, hasMore, nextCursor };
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

  public runTransaction<R>(
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

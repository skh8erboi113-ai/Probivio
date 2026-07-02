import type { Logger } from '@listinglogic/logger';
import { Firestore } from 'firebase-admin/firestore';

import { getDb } from './client.js';
import { Collections } from './collections.js';
import { ConflictError } from './errors.js';

interface IdempotencyRecord {
  readonly key: string;
  readonly operatorId: string;
  readonly route: string;
  readonly responseHash: string;
  readonly statusCode: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/**
 * Idempotency key store — ensures that retried POST requests
 * (e.g. from mobile clients with flaky networks) don't create duplicates.
 *
 * Keys expire after 24 hours via Firestore TTL policy.
 * Enable TTL on `expiresAt` field in Firebase console.
 */
export class IdempotencyRepository {
  private readonly db: Firestore;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.db = getDb();
    this.logger = logger.child({ repository: 'Idempotency' });
  }

  /**
   * Atomically claim an idempotency key.
   * Returns the existing record if the key was already used,
   * or null if this is a fresh request.
   */
  public async claim(
    key: string,
    operatorId: string,
    route: string,
  ): Promise<IdempotencyRecord | null> {
    const ref = this.db.collection(Collections.IDEMPOTENCY_KEYS).doc(key);
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    try {
      return await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);

        if (snap.exists) {
          const existing = snap.data() as IdempotencyRecord;

          if (existing.operatorId !== operatorId) {
            throw new ConflictError('Idempotency key collision across operators');
          }
          if (existing.route !== route) {
            throw new ConflictError('Idempotency key reused across different routes');
          }

          this.logger.debug('Idempotency key already claimed', { key, route });
          return existing;
        }

        // Reserve the key with a pending marker
        const pending: IdempotencyRecord = {
          key,
          operatorId,
          route,
          responseHash: '',
          statusCode: 0,
          createdAt: now.toISOString(),
          expiresAt: expires.toISOString(),
        };
        tx.set(ref, pending);

        return null;
      });
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      this.logger.error('Idempotency claim failed', { key, error: err });
      throw err;
    }
  }

  /**
   * Store the completed response for a key.
   */
  public async complete(
    key: string,
    responseHash: string,
    statusCode: number,
  ): Promise<void> {
    const ref = this.db.collection(Collections.IDEMPOTENCY_KEYS).doc(key);
    await ref.update({ responseHash, statusCode });
  }
}

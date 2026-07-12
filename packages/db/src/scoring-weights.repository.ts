import { type Firestore } from 'firebase-admin/firestore';

import { getDb } from './client.js';
import { Collections, Fields } from './collections.js';

import type { Logger } from '@listinglogic/logger';
import type { IsoTimestamp, ScoringWeights, ScoringWeightsHistoryEntry } from '@listinglogic/types';

/**
 * Scoring weights store. There is exactly one "current" document per
 * operator (keyed by operatorId), plus an append-only history collection
 * so the lead detail page can show how the model's weights have drifted
 * over time (e.g. "urgency now matters 12% more than 30 days ago").
 * The retraining loop writes new versions; the scoring engine reads the
 * latest.
 */
export class ScoringWeightsRepository {
  private readonly db: Firestore;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.db = getDb();
    this.logger = logger.child({ repository: 'ScoringWeights' });
  }

  /**
   * Get the currently active weights for scoring.
   * Falls back to sensible defaults if no trained weights exist yet.
   */
  public async getCurrent(operatorId: string): Promise<ScoringWeights> {
    const snap = await this.db
      .collection(Collections.SCORING_WEIGHTS)
      .doc(operatorId)
      .get();

    if (!snap.exists) return this.getDefaults();

    const data = snap.data();
    if (!data) return this.getDefaults();

    return data as ScoringWeights;
  }

  /**
   * Write new weights after a retraining run. Also appends an immutable
   * history entry so weight drift over time can be reconstructed later —
   * the "current" doc alone can't answer "what were the weights 30 days ago?"
   * once it's overwritten.
   */
  public async save(operatorId: string, weights: ScoringWeights): Promise<void> {
    const historyRef = this.db.collection(Collections.SCORING_WEIGHTS_HISTORY).doc();
    const now = new Date().toISOString() as IsoTimestamp;

    const batch = this.db.batch();
    batch.set(this.db.collection(Collections.SCORING_WEIGHTS).doc(operatorId), weights);
    batch.set(historyRef, {
      id: historyRef.id,
      operatorId: operatorId as ScoringWeightsHistoryEntry['operatorId'],
      weights,
      createdAt: now,
      updatedAt: now,
    } satisfies ScoringWeightsHistoryEntry);
    await batch.commit();

    this.logger.info('Scoring weights updated', {
      operatorId,
      version: weights.version,
      accuracy: weights.validationAccuracy,
    });
  }

  /**
   * The most recent weight-history entry trained at or before `asOf` —
   * i.e. "what weights were active as of N days ago". Used to compute
   * drift deltas against the current weights. Returns null if the
   * operator has no history that old (e.g. brand new account).
   */
  public async findAsOf(operatorId: string, asOf: IsoTimestamp): Promise<ScoringWeightsHistoryEntry | null> {
    const snap = await this.db
      .collection(Collections.SCORING_WEIGHTS_HISTORY)
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where(Fields.CREATED_AT, '<=', asOf)
      .orderBy(Fields.CREATED_AT, 'desc')
      .limit(1)
      .get();

    if (snap.empty) return null;
    return snap.docs[0]?.data() as ScoringWeightsHistoryEntry;
  }

  /**
   * Full weight-history timeline for an operator, oldest first — used to
   * plot drift over time rather than just a single before/after delta.
   */
  public async listHistory(operatorId: string, limit = 100): Promise<readonly ScoringWeightsHistoryEntry[]> {
    const snap = await this.db
      .collection(Collections.SCORING_WEIGHTS_HISTORY)
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .orderBy(Fields.CREATED_AT, 'asc')
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data() as ScoringWeightsHistoryEntry);
  }

  private getDefaults(): ScoringWeights {
    return {
      dealWeight: 0.4,
      motivationWeight: 0.4,
      urgencyWeight: 0.2,
      version: 'default-v1',
      trainedAt: new Date(0).toISOString() as IsoTimestamp,
      trainingSampleSize: 0,
      validationAccuracy: 0,
    };
  }
}

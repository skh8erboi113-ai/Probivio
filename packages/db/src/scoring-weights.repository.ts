import type { Logger } from '@listinglogic/logger';
import type { IsoTimestamp, ScoringWeights } from '@listinglogic/types';
import { Firestore } from 'firebase-admin/firestore';

import { getDb } from './client.js';
import { Collections } from './collections.js';

/**
 * Scoring weights store. There is exactly one document per operator per model version.
 * The retraining loop writes new versions; the scoring engine reads the latest.
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
   * Write new weights after a retraining run.
   */
  public async save(operatorId: string, weights: ScoringWeights): Promise<void> {
    await this.db
      .collection(Collections.SCORING_WEIGHTS)
      .doc(operatorId)
      .set(weights);

    this.logger.info('Scoring weights updated', {
      operatorId,
      version: weights.version,
      accuracy: weights.validationAccuracy,
    });
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

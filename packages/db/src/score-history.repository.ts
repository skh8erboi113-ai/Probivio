import { BaseRepository } from './base.repository.js';
import { Collections, Fields } from './collections.js';

import type { Logger } from '@listinglogic/logger';
import type {
  IsoTimestamp,
  LeadId,
  OperatorId,
  ScoreHistory,
  ScoreHistoryId,
  ScoreResult,
} from '@listinglogic/types';


/**
 * Score history is server-write-only (see firestore.rules).
 * It provides the audit trail and training data for the ML retraining loop.
 */
export class ScoreHistoryRepository extends BaseRepository<ScoreHistory> {
  constructor(logger: Logger) {
    super(Collections.SCORE_HISTORY, 'ScoreHistory', logger);
  }

  /**
   * Persist a score result to the history log.
   */
  public record(
    operatorId: OperatorId,
    leadId: LeadId,
    score: ScoreResult,
    triggeredBy: ScoreHistory['triggeredBy'],
    previousComposite?: number,
  ): Promise<ScoreHistory> {
    return this.create(operatorId, {
      leadId,
      score,
      triggeredBy,
      ...(previousComposite !== undefined && { previousComposite }),
    });
  }

  /**
   * Fetch score history for a lead (newest first).
   */
  public async findByLead(
    operatorId: OperatorId,
    leadId: LeadId,
    limit = 50,
  ): Promise<readonly ScoreHistory[]> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where(Fields.LEAD_ID, '==', leadId)
      .orderBy(Fields.CREATED_AT, 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data());
  }

  /**
   * Fetch score history for retraining. Uses cursor-based pagination
   * to handle large datasets without OOM.
   */
  public async *iterateForTraining(
    operatorId: OperatorId,
    since: IsoTimestamp,
    batchSize = 500,
  ): AsyncGenerator<ScoreHistory, void, unknown> {
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot<ScoreHistory> | null = null;

    while (true) {
      let query = this.collection
        .where(Fields.OPERATOR_ID, '==', operatorId)
        .where(Fields.CREATED_AT, '>=', since)
        .orderBy(Fields.CREATED_AT, 'asc')
        .limit(batchSize);

      if (lastDoc) query = query.startAfter(lastDoc);

      const snap = await query.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        yield doc.data();
      }

      lastDoc = snap.docs[snap.docs.length - 1] ?? null;
      if (snap.size < batchSize) break;
    }
  }

  /**
   * Score history is server-write only.
   */
  public override delete(): Promise<never> {
    throw new Error('Score history is immutable');
  }

  public override update(): Promise<never> {
    throw new Error('Score history is immutable');
  }

  // Only exposed for tests
  public async _testDeleteHistoryForLead(id: ScoreHistoryId): Promise<void> {
    await this.docRef(id).delete();
  }
}

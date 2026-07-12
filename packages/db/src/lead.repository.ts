import { LeadStatus } from '@probivio/types';
import { FieldPath } from 'firebase-admin/firestore';

import { BaseRepository, type ListOptions, type ListResult } from './base.repository.js';
import { Collections, Fields } from './collections.js';

import type { Logger } from '@probivio/logger';
import type {
  IsoTimestamp,
  Lead,
  LeadFilters,
  LeadId,
  LeadSortField,
  OperatorId,
  ScoreResult,
} from '@probivio/types';

export interface LeadListOptions extends ListOptions {
  readonly sortBy: LeadSortField;
  readonly filters: LeadFilters;
}

export class LeadRepository extends BaseRepository<Lead> {
  constructor(logger: Logger) {
    super(Collections.LEADS, 'Lead', logger);
  }

  public listWithFilters(
    operatorId: OperatorId,
    options: LeadListOptions,
  ): Promise<ListResult<Lead>> {
    return this.list(operatorId, options, (query) => {
      let q = query;

      if (options.filters.status) {
        q = q.where(Fields.STATUS, '==', options.filters.status);
      }
      if (options.filters.source) {
        q = q.where(Fields.SOURCE, '==', options.filters.source);
      }
      if (options.filters.motivation) {
        q = q.where('motivation', '==', options.filters.motivation);
      }
      if (options.filters.assignedTo) {
        q = q.where('assignedTo', '==', options.filters.assignedTo);
      }
      if (options.filters.minScore !== undefined) {
        q = q.where(Fields.SCORE, '>=', options.filters.minScore);
      }
      if (options.filters.maxScore !== undefined) {
        q = q.where(Fields.SCORE, '<=', options.filters.maxScore);
      }
      if (options.filters.tags && options.filters.tags.length > 0) {
        // Firestore array-contains-any supports up to 10 values
        q = q.where(Fields.TAGS, 'array-contains-any', options.filters.tags.slice(0, 10));
      }

      return q;
    });
  }

  /**
   * Apply a score result to a lead. Called by the scoring engine.
   * Uses a transaction to ensure score + scoreConfidence + scoredAt are atomic.
   */
  public applyScore(
    operatorId: OperatorId,
    leadId: LeadId,
    score: ScoreResult,
  ): Promise<Lead> {
    return this.update(operatorId, leadId, {
      score: score.composite,
      scoreConfidence: score.confidence,
      scoreExplanation: score.explanation,
      scoredAt: score.scoredAt,
    });
  }

  /**
   * Increment a lead's last-contacted timestamp when a communication is sent.
   * Idempotent — safe to call from automation retries.
   */
  public touchLastContacted(
    operatorId: OperatorId,
    leadId: LeadId,
  ): Promise<Lead> {
    return this.update(operatorId, leadId, {
      lastContactedAt: this.getTimestamp(),
    });
  }

  /**
   * Find leads that haven't been contacted in N days.
   * Used by automation triggers.
   */
  public async findStaleLeads(
    operatorId: OperatorId,
    daysSinceContact: number,
    limit = 100,
  ): Promise<readonly Lead[]> {
    const cutoff = new Date(Date.now() - daysSinceContact * 24 * 60 * 60 * 1000).toISOString();

    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where('lastContactedAt', '<=', cutoff)
      .where(Fields.STATUS, 'in', [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED])
      .orderBy('lastContactedAt', 'asc')
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data());
  }

  /**
   * Find top-scored leads that need follow-up (for daily dashboard).
   */
  public async findHotLeads(
    operatorId: OperatorId,
    minScore = 70,
    limit = 25,
  ): Promise<readonly Lead[]> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where(Fields.SCORE, '>=', minScore)
      .where(Fields.STATUS, 'not-in', [LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST, LeadStatus.DEAD])
      .orderBy(FieldPath.documentId())
      .orderBy(Fields.SCORE, 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data());
  }

  /**
   * Find all leads not yet in a terminal state — used by the scheduled
   * Gemini automation sweep to decide which leads are worth evaluating.
   */
  public async findActiveLeads(operatorId: OperatorId, limit = 500): Promise<readonly Lead[]> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where(Fields.STATUS, 'not-in', [LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST, LeadStatus.DEAD])
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data());
  }

  /**
   * Bulk import — used by CSV import pipeline.
   * Firestore batch max is 500 writes.
   */
  public async bulkCreate(
    operatorId: OperatorId,
    leads: readonly Omit<Lead, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>[],
  ): Promise<readonly LeadId[]> {
    const ids: LeadId[] = [];
    const now = new Date().toISOString();
    const CHUNK_SIZE = 500;

    for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
      const chunk = leads.slice(i, i + CHUNK_SIZE);
      const batch = this.batch();

      for (const lead of chunk) {
        const ref = this.collection.doc();
        const entity = {
          ...lead,
          id: ref.id,
          operatorId,
          createdAt: now,
          updatedAt: now,
        } as Lead;

        batch.set(ref, entity);
        ids.push(ref.id as LeadId);
      }

      await batch.commit();
    }

    this.logger.info('Bulk lead import complete', {
      count: leads.length,
      chunks: Math.ceil(leads.length / CHUNK_SIZE),
    });

    return ids;
  }

  private getTimestamp(): IsoTimestamp {
    return new Date().toISOString() as IsoTimestamp;
  }
}

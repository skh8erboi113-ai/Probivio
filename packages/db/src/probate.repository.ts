import { BaseRepository, type ListOptions, type ListResult } from './base.repository.js';
import { Collections, Fields } from './collections.js';

import type { Logger } from '@listinglogic/logger';
import type {
  IsoTimestamp,
  LeadId,
  OperatorId,
  ProbateCase,
  ProbateCaseId,
  UsStateCode,
} from '@listinglogic/types';


export interface ProbateFilters {
  readonly status?: string;
  readonly state?: UsStateCode;
  readonly county?: string;
  readonly minConfidence?: number;
}

export interface ProbateListOptions extends ListOptions {
  readonly filters: ProbateFilters;
}

export class ProbateRepository extends BaseRepository<ProbateCase> {
  constructor(logger: Logger) {
    super(Collections.PROBATE_CASES, 'ProbateCase', logger);
  }

  public listWithFilters(
    operatorId: OperatorId,
    options: ProbateListOptions,
  ): Promise<ListResult<ProbateCase>> {
    return this.list(operatorId, options, (query) => {
      let q = query;

      if (options.filters.status) q = q.where(Fields.STATUS, '==', options.filters.status);
      if (options.filters.state) q = q.where('state', '==', options.filters.state);
      if (options.filters.county) q = q.where('county', '==', options.filters.county);
      if (options.filters.minConfidence !== undefined) {
        q = q.where('extractionConfidence', '>=', options.filters.minConfidence);
      }

      return q;
    });
  }

  /**
   * Mark a probate case as converted to a lead.
   * Also stamps reviewedAt.
   */
  public markConverted(
    operatorId: OperatorId,
    probateCaseId: ProbateCaseId,
    leadId: LeadId,
  ): Promise<ProbateCase> {
    return this.update(operatorId, probateCaseId, {
      convertedToLeadId: leadId,
      reviewedAt: toIso(),
    });
  }

  /**
   * Find duplicate cases by case number + county + state.
   * Prevents re-importing the same court filing.
   */
  public async findByCaseNumber(
    operatorId: OperatorId,
    caseNumber: string,
    county: string,
    state: UsStateCode,
  ): Promise<ProbateCase | null> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where('caseNumber', '==', caseNumber)
      .where('county', '==', county)
      .where('state', '==', state)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return snap.docs[0]?.data() ?? null;
  }
}

function toIso(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp;
}

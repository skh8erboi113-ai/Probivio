import type { Logger } from '@listinglogic/logger';
import type {
  AgentDecisionLog,
  AgentTrigger,
  IsoTimestamp,
  LeadId,
  OperatorId,
} from '@listinglogic/types';

import { BaseRepository, type ListOptions, type ListResult } from './base.repository.js';
import { Collections, Fields } from './collections.js';

export interface AgentDecisionLogFilters {
  readonly leadId?: LeadId;
  readonly executed?: boolean;
  readonly trigger?: AgentTrigger;
}

export interface AgentDecisionLogListOptions extends ListOptions {
  readonly filters: AgentDecisionLogFilters;
}

/**
 * Immutable audit trail of every decision the Gemini automation agent makes —
 * including decisions it made but that were blocked by a guardrail, and
 * explicit "no_action" decisions. Never mutated after creation.
 */
export class AgentDecisionLogRepository extends BaseRepository<AgentDecisionLog> {
  constructor(logger: Logger) {
    super(Collections.AGENT_DECISION_LOGS, 'AgentDecisionLog', logger);
  }

  public async listWithFilters(
    operatorId: OperatorId,
    options: AgentDecisionLogListOptions,
  ): Promise<ListResult<AgentDecisionLog>> {
    return this.list(operatorId, options, (query) => {
      let q = query;
      if (options.filters.leadId) q = q.where(Fields.LEAD_ID, '==', options.filters.leadId);
      if (options.filters.executed !== undefined) q = q.where('executed', '==', options.filters.executed);
      if (options.filters.trigger) q = q.where('trigger', '==', options.filters.trigger);
      return q;
    });
  }

  /**
   * Count how many `send_email` decisions were actually executed for a lead
   * within the lookback window — the runtime enforcement point for the
   * per-lead daily email cap guardrail.
   */
  public async countExecutedEmailsSince(
    operatorId: OperatorId,
    leadId: LeadId,
    since: IsoTimestamp,
  ): Promise<number> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where(Fields.LEAD_ID, '==', leadId)
      .where('executed', '==', true)
      .where(Fields.CREATED_AT, '>=', since)
      .get();

    return snap.docs.filter((doc) => doc.data().action.type === 'send_email').length;
  }

  public override async update(): Promise<never> {
    throw new Error('Agent decision logs are immutable');
  }

  public override async delete(): Promise<never> {
    throw new Error('Agent decision logs are immutable');
  }
}

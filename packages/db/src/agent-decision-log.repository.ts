
import { BaseRepository, type ListOptions, type ListResult } from './base.repository.js';
import { Collections, Fields } from './collections.js';
import { ConflictError, NotFoundError } from './errors.js';

import type { Logger } from '@listinglogic/logger';
import type {
  AgentDecisionLog,
  AgentTrigger,
  IsoTimestamp,
  LeadId,
  OperatorId,
} from '@listinglogic/types';

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

  public listWithFilters(
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

  public override update(): Promise<never> {
    throw new Error('Agent decision logs are immutable');
  }

  public override delete(): Promise<never> {
    throw new Error('Agent decision logs are immutable');
  }

  /**
   * The one narrow exception to immutability: flipping a confidence-gated
   * decision from "drafted, awaiting human approval" to "approved and
   * executed" (or "rejected"). This does not touch `reasoning`, `action`,
   * or any other field Gemini produced — only the approval-lifecycle fields
   * — so the original decision record is still a faithful, unedited record
   * of what the model proposed and why.
   */
  public resolveApproval(
    operatorId: OperatorId,
    id: string,
    resolution: { readonly executed: boolean; readonly blockedReason?: string },
  ): Promise<AgentDecisionLog> {
    const ref = this.docRef(id);

    return this.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundError(this.entityName, id);

      const current = snap.data();
      if (!current || current.operatorId !== operatorId) {
        throw new NotFoundError(this.entityName, id);
      }
      if (!current.pendingApproval) {
        throw new ConflictError(`Decision is not awaiting approval: ${id}`);
      }

      const updated: AgentDecisionLog = {
        ...current,
        executed: resolution.executed,
        pendingApproval: false,
        ...(resolution.blockedReason && { blockedReason: resolution.blockedReason }),
      };

      tx.set(ref, updated);
      return updated;
    });
  }
}

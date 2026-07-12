import type {
  AuditFields,
  AutomationId,
  LeadId,
  OperatorScoped,
} from './common.js';
import type { LeadStatus } from './lead.js';

/**
 * Events that cause the Gemini decision engine to evaluate a lead.
 * Unlike the old rule-based engine, these don't map 1:1 to actions —
 * they just tell the agent "something happened, decide what (if anything)
 * to do about it now."
 */
export const AgentTrigger = {
  LEAD_CREATED: 'lead_created',
  LEAD_STATUS_CHANGED: 'lead_status_changed',
  LEAD_SCORED: 'lead_scored',
  INTERACTION_RECORDED: 'interaction_recorded',
  SCHEDULED_SWEEP: 'scheduled_sweep',
  MANUAL: 'manual',
} as const;
export type AgentTrigger = (typeof AgentTrigger)[keyof typeof AgentTrigger];

/**
 * The complete, closed set of actions Gemini is allowed to take on a lead.
 *
 * This whitelist is enforced in code (packages/validators' agentDecisionSchema
 * plus a runtime allow-list check in the agent service) — Gemini's raw output
 * is never executed directly. If the model asks for anything outside this
 * union, the decision is rejected and logged, never run.
 */
export type AgentAction =
  | { readonly type: 'send_email'; readonly subject: string; readonly body: string }
  | { readonly type: 'add_tag'; readonly tag: string }
  | { readonly type: 'remove_tag'; readonly tag: string }
  | { readonly type: 'change_status'; readonly status: LeadStatus }
  | { readonly type: 'schedule_follow_up'; readonly inDays: number; readonly note: string }
  | { readonly type: 'no_action' };

export type AgentActionType = AgentAction['type'];

/**
 * Immutable audit record of one Gemini decision cycle for one lead.
 * Written for every evaluation — including "no_action" — so operators can
 * see exactly what the AI considered and why, not just what it did.
 */
export interface AgentDecisionLog extends OperatorScoped, AuditFields {
  readonly id: AutomationId;
  readonly leadId: LeadId;
  readonly trigger: AgentTrigger;
  readonly action: AgentAction;
  readonly reasoning: string;
  readonly executed: boolean;
  /** Set when `executed` is false — guardrail name or error that blocked the action. */
  readonly blockedReason?: string;
  readonly modelVersion: string;
}

export type CreateAgentDecisionLogInput = Omit<
  AgentDecisionLog,
  'id' | 'operatorId' | 'createdAt' | 'updatedAt'
>;

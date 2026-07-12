import type {
  AuditFields,
  AutomationId,
  LeadId,
  OperatorId,
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
  /**
   * Gemini's self-reported confidence (0-1) that this is the right action.
   * Used by confidence-gated autonomy: below the operator's configured
   * threshold, the action is drafted for one-tap approval instead of being
   * auto-executed. Optional because older log entries predate this field.
   */
  readonly confidence?: number;
  /**
   * Alternatives Gemini considered and explicitly rejected before settling
   * on `action`, each with a one-line reason — e.g. "could have emailed,
   * but this lead already received one today, so scheduled a follow-up
   * instead." Surfaced in the UI so operators can audit the model's
   * judgment, not just its output. Optional for the same reason as
   * `confidence` — decisions logged before this feature shipped won't have it.
   */
  readonly alternativesConsidered?: readonly AgentAlternative[];
  readonly executed: boolean;
  /** Set when `executed` is false — guardrail name or error that blocked the action. */
  readonly blockedReason?: string;
  /**
   * Set when a decision cleared guardrails but fell below the operator's
   * autonomy confidence threshold — it was drafted but requires a human
   * one-tap approval before `executeAction` actually runs it.
   */
  readonly pendingApproval?: boolean;
  readonly modelVersion: string;
}

/** One action Gemini considered but did not take, and why. */
export interface AgentAlternative {
  readonly action: AgentActionType;
  readonly reasonRejected: string;
}

export type CreateAgentDecisionLogInput = Omit<
  AgentDecisionLog,
  'id' | 'operatorId' | 'createdAt' | 'updatedAt'
>;

/**
 * Per-operator autonomy configuration for the Gemini agent — "confidence-gated
 * autonomy". Operators dial in how much they trust the agent to act without
 * a human in the loop: above `autonomyThreshold`, Gemini executes actions
 * immediately; below it, the action is drafted and logged as
 * `pendingApproval: true`, and must be approved via the decisions UI before
 * it runs. `send_email` can additionally be forced to always require
 * approval regardless of confidence, since it's the highest-stakes action
 * (a real message to a real person).
 */
export interface OperatorAgentSettings extends OperatorScoped, AuditFields {
  readonly id: OperatorId;
  /** 0-1. Decisions with confidence >= this run immediately. Default 0.75. */
  readonly autonomyThreshold: number;
  /** When true, `send_email` decisions always require approval regardless of confidence. */
  readonly requireApprovalForEmail: boolean;
}

export type UpdateOperatorAgentSettingsInput = Partial<
  Pick<OperatorAgentSettings, 'autonomyThreshold' | 'requireApprovalForEmail'>
>;

export const DEFAULT_AUTONOMY_THRESHOLD = 0.75;


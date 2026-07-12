import { AgentTrigger } from '@listinglogic/types';
import { z } from 'zod';

import { leadStatusSchema } from './lead.schema.js';
import { paginationSchema, safeStringSchema } from './primitives.js';

/**
 * The whitelist Gemini's decisions are validated against.
 *
 * This is the hard guardrail: Gemini's raw JSON response is parsed with this
 * schema before the agent service is allowed to execute anything. Any output
 * that doesn't match one of these exact shapes (extra actions, malformed
 * fields, injected instructions in string fields) fails validation and the
 * decision is logged as blocked, never executed.
 */
export const agentActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_email'),
    subject: safeStringSchema(1, 200),
    body: safeStringSchema(1, 5000),
  }),
  z.object({ type: z.literal('add_tag'), tag: z.string().trim().toLowerCase().min(1).max(50) }),
  z.object({ type: z.literal('remove_tag'), tag: z.string().trim().toLowerCase().min(1).max(50) }),
  z.object({ type: z.literal('change_status'), status: leadStatusSchema }),
  z.object({
    type: z.literal('schedule_follow_up'),
    inDays: z.number().int().min(1).max(90),
    note: safeStringSchema(1, 500),
  }),
  z.object({ type: z.literal('no_action') }),
]);

/**
 * One action Gemini considered but rejected in favor of `action` — the
 * "counterfactual" trail. `action` here is just the action-type string
 * (not a full action object) since the point is to record *what kind* of
 * move was on the table and why it lost out, not to re-litigate its exact
 * parameters.
 */
export const agentAlternativeSchema = z.object({
  action: z.enum(['send_email', 'add_tag', 'remove_tag', 'change_status', 'schedule_follow_up', 'no_action']),
  reasonRejected: safeStringSchema(1, 300),
});

/**
 * The full shape Gemini must return for every decision cycle — action plus
 * the reasoning behind it. `reasoning` is always required (even for
 * `no_action`) so every decision is auditable.
 *
 * `confidence` (0-1) drives confidence-gated autonomy: operators set a
 * per-operator threshold below which a decision is drafted for one-tap
 * approval instead of executed immediately (see AgentService.evaluateLead).
 *
 * `alternativesConsidered` is optional counterfactual reasoning — up to 3
 * other actions Gemini weighed and rejected, each with a short reason. This
 * is what lets operators see "could have emailed, but this lead already got
 * one today, so I scheduled a follow-up instead" rather than just the final
 * action.
 */
export const agentDecisionSchema = z.object({
  reasoning: safeStringSchema(1, 1000),
  confidence: z.number().min(0).max(1).default(1),
  alternativesConsidered: z.array(agentAlternativeSchema).max(3).default([]),
  action: agentActionSchema,
});

export const agentTriggerSchema = z.enum([
  AgentTrigger.LEAD_CREATED,
  AgentTrigger.LEAD_STATUS_CHANGED,
  AgentTrigger.LEAD_SCORED,
  AgentTrigger.INTERACTION_RECORDED,
  AgentTrigger.SCHEDULED_SWEEP,
  AgentTrigger.MANUAL,
]);

export const agentDecisionLogFiltersSchema = z
  .object({
    leadId: z.string().optional(),
    executed: z.coerce.boolean().optional(),
    trigger: agentTriggerSchema.optional(),
    sortBy: z.enum(['createdAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .merge(paginationSchema);

export const runAgentSweepSchema = z.object({
  operatorIds: z.array(z.string().min(1)).optional(),
});

/**
 * Confidence-gated autonomy dial, set by the operator. `autonomyThreshold`
 * is intentionally bounded away from the extremes (5%-100%) — 0% would mean
 * "always execute no matter how unsure the model is", which defeats the
 * point of the feature.
 */
export const updateOperatorAgentSettingsSchema = z.object({
  autonomyThreshold: z.number().min(0.05).max(1).optional(),
  requireApprovalForEmail: z.boolean().optional(),
});

export const resolveAgentDecisionApprovalSchema = z.object({
  approve: z.boolean(),
});

export type AgentActionPayload = z.infer<typeof agentActionSchema>;
export type AgentAlternativePayload = z.infer<typeof agentAlternativeSchema>;
export type AgentDecisionPayload = z.infer<typeof agentDecisionSchema>;
export type AgentDecisionLogFiltersPayload = z.infer<typeof agentDecisionLogFiltersSchema>;
export type RunAgentSweepPayload = z.infer<typeof runAgentSweepSchema>;
export type UpdateOperatorAgentSettingsPayload = z.infer<typeof updateOperatorAgentSettingsSchema>;
export type ResolveAgentDecisionApprovalPayload = z.infer<typeof resolveAgentDecisionApprovalSchema>;

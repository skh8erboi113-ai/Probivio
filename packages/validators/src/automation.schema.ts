import { AgentTrigger } from '@listinglogic/types';
import { z } from 'zod';

import { paginationSchema, safeStringSchema } from './primitives.js';
import { leadStatusSchema } from './lead.schema.js';

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
 * The full shape Gemini must return for every decision cycle — action plus
 * the reasoning behind it. `reasoning` is always required (even for
 * `no_action`) so every decision is auditable.
 */
export const agentDecisionSchema = z.object({
  reasoning: safeStringSchema(1, 1000),
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

export type AgentActionPayload = z.infer<typeof agentActionSchema>;
export type AgentDecisionPayload = z.infer<typeof agentDecisionSchema>;
export type AgentDecisionLogFiltersPayload = z.infer<typeof agentDecisionLogFiltersSchema>;
export type RunAgentSweepPayload = z.infer<typeof runAgentSweepSchema>;

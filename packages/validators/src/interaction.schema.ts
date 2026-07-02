import { InteractionOutcome, InteractionType } from '@listinglogic/types';
import { z } from 'zod';

import { isoTimestampSchema, paginationSchema } from './primitives.js';

export const interactionTypeSchema = z.enum(
  Object.values(InteractionType) as [string, ...string[]],
);

export const interactionOutcomeSchema = z.enum([
  InteractionOutcome.POSITIVE,
  InteractionOutcome.NEUTRAL,
  InteractionOutcome.NEGATIVE,
]);

export const createInteractionSchema = z.object({
  leadId: z.string().min(1),
  type: interactionTypeSchema,
  outcome: interactionOutcomeSchema.default(InteractionOutcome.NEUTRAL),
  metadata: z.record(z.unknown()).default({}),
  occurredAt: isoTimestampSchema.default(() => new Date().toISOString()),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  channelId: z.string().max(200).optional(),
});

export const interactionFiltersSchema = z
  .object({
    leadId: z.string().optional(),
    type: interactionTypeSchema.optional(),
    outcome: interactionOutcomeSchema.optional(),
    since: isoTimestampSchema.optional(),
    until: isoTimestampSchema.optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .merge(paginationSchema);

export type CreateInteractionPayload = z.infer<typeof createInteractionSchema>;
export type InteractionFiltersPayload = z.infer<typeof interactionFiltersSchema>;

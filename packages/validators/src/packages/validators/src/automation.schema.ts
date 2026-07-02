import { ActionType, AutomationTrigger, LeadStatus } from '@listinglogic/types';
import { z } from 'zod';

import { paginationSchema, safeStringSchema } from './primitives.js';
import { leadStatusSchema } from './lead.schema.js';

// ─── Trigger conditions ───────────────────────────────────────────────────
export const triggerConditionsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lead_created'), source: z.string().optional() }),
  z.object({
    type: z.literal('lead_status_changed'),
    fromStatus: leadStatusSchema.optional(),
    toStatus: leadStatusSchema,
  }),
  z.object({ type: z.literal('lead_scored') }),
  z.object({ type: z.literal('score_above_threshold'), threshold: z.number().min(0).max(100) }),
  z.object({ type: z.literal('no_contact_for_days'), days: z.number().int().min(1).max(365) }),
  z.object({ type: z.literal('tag_added'), tag: z.string().min(1).max(50) }),
  z.object({ type: z.literal('manual') }),
  z.object({
    type: z.literal('scheduled'),
    cron: z.string().regex(/^[\d*,/\-\s]+$/, 'Invalid cron expression'),
  }),
]);

// ─── Action schemas ───────────────────────────────────────────────────────
const baseActionFields = {
  id: z.string().min(1).max(100),
  delayMinutes: z.number().int().min(0).max(43_200).default(0),   // max 30 days
};

export const automationActionSchema = z.discriminatedUnion('type', [
  z.object({
    ...baseActionFields,
    type: z.literal(ActionType.SEND_SMS),
    templateId: z.string().min(1).max(100),
    toField: z.enum(['phone', 'alternatePhone']).default('phone'),
  }),
  z.object({
    ...baseActionFields,
    type: z.literal(ActionType.SEND_EMAIL),
    templateId: z.string().min(1).max(100),
    subject: safeStringSchema(1, 200),
  }),
  z.object({
    ...baseActionFields,
    type: z.literal(ActionType.SEND_TELEGRAM),
    chatId: z.string().min(1),
    message: safeStringSchema(1, 4096),
  }),
  z.object({ ...baseActionFields, type: z.literal(ActionType.ADD_TAG), tag: z.string().min(1).max(50) }),
  z.object({ ...baseActionFields, type: z.literal(ActionType.REMOVE_TAG), tag: z.string().min(1).max(50) }),
  z.object({ ...baseActionFields, type: z.literal(ActionType.CHANGE_STATUS), status: leadStatusSchema }),
  z.object({ ...baseActionFields, type: z.literal(ActionType.ASSIGN_TO), operatorId: z.string().min(1) }),
  z.object({
    ...baseActionFields,
    type: z.literal(ActionType.CREATE_TASK),
    title: safeStringSchema(1, 200),
    dueInDays: z.number().int().min(1).max(365),
  }),
  z.object({
    ...baseActionFields,
    type: z.literal(ActionType.WEBHOOK),
    url: z.string().url(),
    method: z.enum(['POST', 'PUT']).default('POST'),
  }),
  z.object({
    ...baseActionFields,
    type: z.literal(ActionType.WAIT),
    durationMinutes: z.number().int().min(1).max(43_200),
  }),
]);

// ─── Automation CRUD ──────────────────────────────────────────────────────
export const createAutomationSchema = z
  .object({
    name: safeStringSchema(1, 100),
    description: safeStringSchema(0, 500).optional(),
    trigger: z.enum([
      AutomationTrigger.LEAD_CREATED,
      AutomationTrigger.LEAD_STATUS_CHANGED,
      AutomationTrigger.LEAD_SCORED,
      AutomationTrigger.SCORE_ABOVE_THRESHOLD,
      AutomationTrigger.NO_CONTACT_FOR_DAYS,
      AutomationTrigger.TAG_ADDED,
      AutomationTrigger.MANUAL,
      AutomationTrigger.SCHEDULED,
    ]),
    conditions: triggerConditionsSchema,
    actions: z.array(automationActionSchema).min(1, 'At least one action required').max(20),
    isActive: z.boolean().default(false),
  })
  .refine((data) => data.trigger === data.conditions.type, {
    message: 'Trigger type must match conditions type',
    path: ['conditions'],
  });

export const updateAutomationSchema = z
  .object({
    name: safeStringSchema(1, 100).optional(),
    description: safeStringSchema(0, 500).optional(),
    conditions: triggerConditionsSchema.optional(),
    actions: z.array(automationActionSchema).min(1).max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const automationFiltersSchema = z
  .object({
    isActive: z.coerce.boolean().optional(),
    trigger: z.string().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'runCount', 'name']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .merge(paginationSchema);

export const triggerAutomationSchema = z.object({
  automationId: z.string().min(1),
  leadId: z.string().min(1),
});

export type CreateAutomationPayload = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationPayload = z.infer<typeof updateAutomationSchema>;
export type AutomationFiltersPayload = z.infer<typeof automationFiltersSchema>;

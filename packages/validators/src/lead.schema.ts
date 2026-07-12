import { LeadSource, LeadStatus, MotivationLevel, PropertyCondition } from '@probivio/types';
import { z } from 'zod';

import {
  centsSchema,
  emailSchema,
  isoTimestampSchema,
  optionalNoteSchema,
  paginationSchema,
  phoneSchema,
  safeStringSchema,
  scoreSchema,
  stateSchema,
  tagsArraySchema,
  zipSchema,
} from './primitives.js';

// ─── Enum schemas from const objects ──────────────────────────────────────
export const leadStatusSchema = z.enum([
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.UNDER_CONTRACT,
  LeadStatus.CLOSED_WON,
  LeadStatus.CLOSED_LOST,
  LeadStatus.DEAD,
]);

export const leadSourceSchema = z.enum([
  LeadSource.PROBATE,
  LeadSource.DIRECT_MAIL,
  LeadSource.COLD_CALL,
  LeadSource.REFERRAL,
  LeadSource.DRIVING_FOR_DOLLARS,
  LeadSource.WEB_FORM,
  LeadSource.PPC,
  LeadSource.BANDIT_SIGN,
  LeadSource.OTHER,
]);

export const motivationSchema = z.enum([
  MotivationLevel.UNKNOWN,
  MotivationLevel.LOW,
  MotivationLevel.MEDIUM,
  MotivationLevel.HIGH,
  MotivationLevel.URGENT,
]);

export const propertyConditionSchema = z.enum([
  PropertyCondition.UNKNOWN,
  PropertyCondition.TURNKEY,
  PropertyCondition.LIGHT_REHAB,
  PropertyCondition.MEDIUM_REHAB,
  PropertyCondition.HEAVY_REHAB,
  PropertyCondition.TEARDOWN,
]);

// ─── Sub-schemas ──────────────────────────────────────────────────────────
export const contactInfoSchema = z.object({
  firstName: safeStringSchema(1, 100),
  lastName: safeStringSchema(1, 100),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  alternatePhone: phoneSchema.optional(),
}).refine((data) => data.email || data.phone, {
  message: 'At least one of email or phone is required',
  path: ['email'],
});

export const propertyDetailsSchema = z.object({
  address: safeStringSchema(3, 200),
  city: safeStringSchema(1, 100),
  state: stateSchema,
  zip: zipSchema,
  county: safeStringSchema(1, 100).optional(),
  beds: z.number().int().min(0).max(50).optional(),
  baths: z.number().min(0).max(50).optional(),
  sqft: z.number().int().min(0).max(1_000_000).optional(),
  yearBuilt: z.number().int().min(1600).max(new Date().getFullYear() + 5).optional(),
  lotSize: z.number().min(0).max(10_000_000).optional(),
  propertyType: safeStringSchema(1, 50).optional(),
  condition: propertyConditionSchema.optional(),
});

export const dealMetricsSchema = z.object({
  estimatedValue: centsSchema.optional(),
  askingPrice: centsSchema.optional(),
  arv: centsSchema.optional(),
  repairEstimate: centsSchema.optional(),
  assignmentFee: centsSchema.optional(),
  maxOffer: centsSchema.optional(),
}).refine(
  (data) => {
    if (data.arv && data.repairEstimate && data.maxOffer) {
      // 70% rule sanity check — maxOffer should not exceed 70% of ARV - repairs
      const seventy = data.arv * 0.7 - data.repairEstimate;
      return data.maxOffer <= seventy * 1.2;    // 20% tolerance
    }
    return true;
  },
  { message: 'Max offer violates 70% rule sanity check', path: ['maxOffer'] },
);

// ─── Create input ─────────────────────────────────────────────────────────
export const createLeadSchema = z.object({
  contact: contactInfoSchema,
  property: propertyDetailsSchema,
  metrics: dealMetricsSchema.default({}),
  source: leadSourceSchema,
  status: leadStatusSchema.default(LeadStatus.NEW),
  motivation: motivationSchema.default(MotivationLevel.UNKNOWN),
  notes: optionalNoteSchema,
  tags: tagsArraySchema,
  assignedTo: z.string().optional(),
  nextFollowUpAt: isoTimestampSchema.optional(),
  probateCaseId: z.string().optional(),
});

// ─── Update input (all optional) ──────────────────────────────────────────
export const updateLeadSchema = createLeadSchema.partial().strict();

// ─── Query filters ────────────────────────────────────────────────────────
export const leadFiltersSchema = z
  .object({
    status: leadStatusSchema.optional(),
    source: leadSourceSchema.optional(),
    motivation: motivationSchema.optional(),
    minScore: scoreSchema.optional(),
    maxScore: scoreSchema.optional(),
    assignedTo: z.string().optional(),
    search: safeStringSchema(1, 100).optional(),
    tag: z.string().optional(),
    sortBy: z
      .enum(['createdAt', 'updatedAt', 'score', 'lastContactedAt', 'nextFollowUpAt'])
      .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .merge(paginationSchema);

// ─── Score request ────────────────────────────────────────────────────────
export const scoreLeadRequestSchema = z.object({
  leadId: z.string().min(1),
  forceRescore: z.boolean().default(false),
});

// ─── Send communication request (email only — SMS was removed) ───────────
export const sendCommunicationSchema = z.object({
  leadId: z.string().min(1),
  channel: z.literal('email'),
  templateId: z.string().min(1).max(100),
  variables: z.record(z.string(), z.string()).default({}),
});

// ─── Inferred types (for downstream use) ──────────────────────────────────
export type CreateLeadPayload = z.infer<typeof createLeadSchema>;
export type UpdateLeadPayload = z.infer<typeof updateLeadSchema>;
export type LeadFiltersPayload = z.infer<typeof leadFiltersSchema>;
export type ScoreLeadPayload = z.infer<typeof scoreLeadRequestSchema>;
export type SendCommunicationPayload = z.infer<typeof sendCommunicationSchema>;

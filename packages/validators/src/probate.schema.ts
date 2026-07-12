import { ProbateStatus } from '@probivio/types';
import { z } from 'zod';

import {
  isoTimestampSchema,
  paginationSchema,
  safeStringSchema,
  stateSchema,
} from './primitives.js';

export const probateStatusSchema = z.enum([
  ProbateStatus.FILED,
  ProbateStatus.PENDING,
  ProbateStatus.IN_ADMINISTRATION,
  ProbateStatus.CLOSED,
  ProbateStatus.UNKNOWN,
]);

export const decedentSchema = z.object({
  fullName: safeStringSchema(1, 200),
  dateOfDeath: isoTimestampSchema.optional(),
  lastKnownAddress: safeStringSchema(1, 300).optional(),
  age: z.number().int().min(0).max(150).optional(),
});

export const executorSchema = z.object({
  fullName: safeStringSchema(1, 200),
  relationship: safeStringSchema(1, 100).optional(),
  address: safeStringSchema(1, 300).optional(),
  phone: safeStringSchema(1, 20).optional(),
  email: z.string().email().optional(),
});

export const assetSchema = z.object({
  type: z.enum(['real_property', 'vehicle', 'financial', 'other']),
  description: safeStringSchema(1, 500),
  estimatedValue: z.number().min(0).optional(),
  address: safeStringSchema(1, 300).optional(),
});

export const createProbateCaseSchema = z.object({
  caseNumber: safeStringSchema(1, 100),
  county: safeStringSchema(1, 100),
  state: stateSchema,
  courtName: safeStringSchema(1, 200),
  filedAt: isoTimestampSchema,
  status: probateStatusSchema.default(ProbateStatus.FILED),
  decedent: decedentSchema,
  executors: z.array(executorSchema).default([]),
  assets: z.array(assetSchema).default([]),
  estimatedEstateValue: z.number().min(0).optional(),
  sourceDocumentUrl: z.string().url().optional(),
  extractionConfidence: z.number().min(0).max(1).default(0),
  rawExtractedText: z.string().max(500_000).optional(),
});

export const updateProbateCaseSchema = createProbateCaseSchema.partial().strict();

export const probateFiltersSchema = z
  .object({
    status: probateStatusSchema.optional(),
    state: stateSchema.optional(),
    county: safeStringSchema(1, 100).optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
    sortBy: z.enum(['createdAt', 'filedAt', 'extractionConfidence']).default('filedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .merge(paginationSchema);

/**
 * Payload accepted by POST /api/probate/scan.
 * We accept either a base64 PDF up to 20MB or a URL to fetch.
 */
export const scanProbatePdfSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('base64'),
    filename: safeStringSchema(1, 200),
    data: z.string().min(1).max(28_000_000),
  }),
  z.object({
    type: z.literal('url'),
    url: z.string().url(),
  }),
]);

export const convertProbateToLeadSchema = z.object({
  probateCaseId: z.string().min(1),
});

export type CreateProbateCasePayload = z.infer<typeof createProbateCaseSchema>;
export type UpdateProbateCasePayload = z.infer<typeof updateProbateCaseSchema>;
export type ProbateFiltersPayload = z.infer<typeof probateFiltersSchema>;
export type ScanProbatePdfPayload = z.infer<typeof scanProbatePdfSchema>;

import { BuyerStatus, BuyerType, InvestmentStrategy } from '@listinglogic/types';
import { z } from 'zod';

import {
  centsSchema,
  emailSchema,
  optionalNoteSchema,
  paginationSchema,
  phoneSchema,
  safeStringSchema,
  stateSchema,
  tagsArraySchema,
  zipSchema,
} from './primitives.js';

export const buyerTypeSchema = z.enum([
  BuyerType.CASH,
  BuyerType.HARD_MONEY,
  BuyerType.CONVENTIONAL,
  BuyerType.PORTFOLIO,
  BuyerType.HYBRID,
]);

export const buyerStatusSchema = z.enum([
  BuyerStatus.ACTIVE,
  BuyerStatus.PAUSED,
  BuyerStatus.BLACKLISTED,
]);

export const strategySchema = z.enum([
  InvestmentStrategy.FIX_AND_FLIP,
  InvestmentStrategy.BUY_AND_HOLD,
  InvestmentStrategy.WHOLESALE,
  InvestmentStrategy.BRRRR,
  InvestmentStrategy.DEVELOPMENT,
]);

export const buyBoxSchema = z
  .object({
    states: z.array(stateSchema).min(1, 'At least one state required').max(50),
    cities: z.array(safeStringSchema(1, 100)).max(200).default([]),
    zipCodes: z.array(zipSchema).max(500).default([]),
    minBeds: z.number().int().min(0).max(50).default(0),
    maxBeds: z.number().int().min(0).max(50).default(10),
    minBaths: z.number().min(0).max(50).default(0),
    maxBaths: z.number().min(0).max(50).default(10),
    minSqft: z.number().int().min(0).max(1_000_000).default(0),
    maxSqft: z.number().int().min(0).max(1_000_000).default(100_000),
    minPrice: centsSchema.default(0),
    maxPrice: centsSchema,
    minYearBuilt: z.number().int().min(1600).max(new Date().getFullYear() + 5).optional(),
    propertyTypes: z.array(safeStringSchema(1, 50)).min(1),
    strategies: z.array(strategySchema).min(1),
    excludedZips: z.array(zipSchema).max(500).default([]),
  })
  .refine((box) => box.maxBeds >= box.minBeds, {
    message: 'maxBeds must be >= minBeds',
    path: ['maxBeds'],
  })
  .refine((box) => box.maxBaths >= box.minBaths, {
    message: 'maxBaths must be >= minBaths',
    path: ['maxBaths'],
  })
  .refine((box) => box.maxSqft >= box.minSqft, {
    message: 'maxSqft must be >= minSqft',
    path: ['maxSqft'],
  })
  .refine((box) => box.maxPrice >= box.minPrice, {
    message: 'maxPrice must be >= minPrice',
    path: ['maxPrice'],
  });

export const createBuyerSchema = z.object({
  firstName: safeStringSchema(1, 100),
  lastName: safeStringSchema(1, 100),
  company: safeStringSchema(1, 200).optional(),
  email: emailSchema,
  phone: phoneSchema.optional(),
  type: buyerTypeSchema,
  status: buyerStatusSchema.default(BuyerStatus.ACTIVE),
  buyBox: buyBoxSchema,
  closingTimeline: z.number().int().min(1).max(365).default(30),
  proofOfFundsVerified: z.boolean().default(false),
  proofOfFundsAmount: centsSchema.optional(),
  notes: optionalNoteSchema,
  tags: tagsArraySchema,
});

export const updateBuyerSchema = createBuyerSchema.partial().strict();

export const buyerFiltersSchema = z
  .object({
    type: buyerTypeSchema.optional(),
    status: buyerStatusSchema.optional(),
    state: stateSchema.optional(),
    search: safeStringSchema(1, 100).optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'totalDealsClosed']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .merge(paginationSchema);

export const matchBuyersRequestSchema = z.object({
  leadId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  minMatchScore: z.coerce.number().min(0).max(100).default(60),
});

export type CreateBuyerPayload = z.infer<typeof createBuyerSchema>;
export type UpdateBuyerPayload = z.infer<typeof updateBuyerSchema>;
export type BuyerFiltersPayload = z.infer<typeof buyerFiltersSchema>;
export type MatchBuyersPayload = z.infer<typeof matchBuyersRequestSchema>;

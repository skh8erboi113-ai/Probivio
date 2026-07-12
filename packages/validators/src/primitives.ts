import { z } from 'zod';

/**
 * Reusable primitive schemas. Compose these into entity schemas.
 * Every one includes strict format validation.
 */

// ─── ID validation (Firestore auto-IDs are 20 chars) ──────────────────────
export const firestoreIdSchema = z
  .string()
  .min(1, 'ID cannot be empty')
  .max(1500, 'ID exceeds Firestore limit')
  .regex(/^[a-zA-Z0-9_-]+$/, 'ID contains invalid characters');

// ─── Contact ──────────────────────────────────────────────────────────────
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254, 'Email exceeds RFC 5321 limit')
  .email('Invalid email address');

/**
 * E.164 format: +[country code][number], max 15 digits.
 * We accept common US formats and normalize server-side.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[1-9]\d{1,14}$|^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
    'Invalid phone number format',
  )
  .transform((val) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return val.startsWith('+') ? val : `+${digits}`;
  });

// ─── Geography ────────────────────────────────────────────────────────────
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
] as const;

export const stateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((val): val is (typeof US_STATES)[number] => US_STATES.includes(val as (typeof US_STATES)[number]), {
    message: 'Must be a valid US state code',
  });

export const zipSchema = z
  .string()
  .trim()
  .regex(/^\d{5}(-\d{4})?$/, 'Invalid US ZIP code');

// ─── Text (sanitized) ─────────────────────────────────────────────────────
/**
 * Trims, enforces length, and strips control characters that could be used
 * for prompt injection or log poisoning.
 */
export const safeStringSchema = (min: number, max: number): z.ZodType<string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .transform((val) => val.replace(/[\x00-\x1F\x7F]/g, ''));

export const optionalNoteSchema = z
  .string()
  .trim()
  .max(5000, 'Notes exceed 5000 characters')
  .transform((val) => val.replace(/[\x00-\x1F\x7F]/g, ''))
  .optional();

// ─── Money ────────────────────────────────────────────────────────────────
/**
 * Accept either cents (integer) or dollars (transformed to cents).
 * Range: $0 to $100M — beyond that is suspicious for wholesale.
 */
export const centsSchema = z
  .number()
  .int('Amount must be integer cents')
  .min(0, 'Amount cannot be negative')
  .max(10_000_000_000, 'Amount exceeds maximum');

export const dollarsSchema = z
  .number()
  .min(0)
  .max(100_000_000)
  .transform((val) => Math.round(val * 100));

// ─── Timestamps ───────────────────────────────────────────────────────────
export const isoTimestampSchema = z
  .string()
  .datetime({ offset: true, message: 'Must be a valid ISO 8601 timestamp' });

// ─── Tags ─────────────────────────────────────────────────────────────────
export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9][a-z0-9\-_]*$/, 'Tags must start with alphanumeric, contain only lowercase letters, numbers, hyphens, underscores');

export const tagsArraySchema = z
  .array(tagSchema)
  .max(20, 'Maximum 20 tags per entity')
  .default([]);

// ─── Pagination ───────────────────────────────────────────────────────────
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** Opaque cursor from a previous response's `pagination.nextCursor`. Omit for the first page. */
  cursor: z.string().max(500).optional(),
});

// ─── Score ────────────────────────────────────────────────────────────────
export const scoreSchema = z.number().min(0).max(100);
export const confidenceSchema = z.number().min(0).max(1);

import { z } from 'zod';

/**
 * The canonical environment validation schema.
 * Used by apps/streamline/src/config/config.ts at startup.
 *
 * Fail-fast philosophy: if any required var is missing, the process refuses to boot.
 */

const nonEmpty = (name: string) => z.string().min(1, `${name} is required`);

export const envSchema = z.object({
  // ─── Runtime ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),

  // ─── Firebase (REQUIRED) ────────────────────────────────────────────────
  FIREBASE_PROJECT_ID: nonEmpty('FIREBASE_PROJECT_ID'),
  FIREBASE_CLIENT_EMAIL: z.string().email('FIREBASE_CLIENT_EMAIL must be a valid email'),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .min(1, 'FIREBASE_PRIVATE_KEY is required')
    .transform((val) => val.replace(/\\n/g, '\n'))
    .refine((val) => val.includes('BEGIN PRIVATE KEY'), {
      message: 'FIREBASE_PRIVATE_KEY must be a valid PEM key',
    }),

  // ─── Security (REQUIRED) ────────────────────────────────────────────────
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  // ─── CORS ───────────────────────────────────────────────────────────────
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:3000')
    .transform((val) => val.split(',').map((o) => o.trim()).filter(Boolean)),

  // ─── External APIs (OPTIONAL — features degrade gracefully) ─────────────
  GEMINI_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[a-f0-9]{32}$/, 'Invalid Twilio SID').optional(),
  TWILIO_AUTH_TOKEN: z.string().min(32).optional(),
  TWILIO_FROM_NUMBER: z.string().regex(/^\+\d{10,15}$/, 'Twilio from number must be E.164').optional(),
  SENDGRID_API_KEY: z.string().startsWith('SG.', 'SendGrid keys start with SG.').optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  SKIP_TRACE_API_KEY: z.string().optional(),

  // ─── Infrastructure (OPTIONAL) ──────────────────────────────────────────
  REDIS_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),

  // ─── Feature flags ──────────────────────────────────────────────────────
  ENABLE_ML_RETRAINING: z.coerce.boolean().default(true),
  ENABLE_AUTOMATION_ENGINE: z.coerce.boolean().default(true),
  ENABLE_PROBATE_SCANNER: z.coerce.boolean().default(true),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

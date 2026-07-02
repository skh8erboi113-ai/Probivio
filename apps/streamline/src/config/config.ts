import { envSchema, type ValidatedEnv } from '@listinglogic/validators';
import { config as loadDotenv } from 'dotenv';

/**
 * Centralized environment validation.
 * The process refuses to start if required variables are missing or malformed.
 *
 * DO NOT read from process.env anywhere else in the codebase — always import from here.
 */

let cached: ValidatedEnv | null = null;

export function loadConfig(): ValidatedEnv {
  if (cached) return cached;

  // Load .env in non-production. Cloud Run injects env vars directly.
  if (process.env.NODE_ENV !== 'production') {
    loadDotenv({ override: false });
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    // eslint-disable-next-line no-console
    console.error(
      `\n╔════════════════════════════════════════════════════════════════╗\n` +
      `║  ENVIRONMENT VALIDATION FAILED                                 ║\n` +
      `║  The server refuses to start with an invalid configuration.    ║\n` +
      `╚════════════════════════════════════════════════════════════════╝\n\n` +
      `${issues}\n\n` +
      `Check .env.example for the required schema.\n`,
    );

    process.exit(1);
  }

  cached = parsed.data;
  return cached;
}

export function getConfig(): ValidatedEnv {
  if (!cached) {
    throw new Error('Config not loaded. Call loadConfig() at startup.');
  }
  return cached;
}

/**
 * Feature detection based on presence of API keys.
 * Enables graceful degradation when optional integrations are unavailable.
 */
export interface FeatureFlags {
  readonly geminiEnabled: boolean;
  readonly twilioEnabled: boolean;
  readonly sendgridEnabled: boolean;
  readonly telegramEnabled: boolean;
  readonly discordEnabled: boolean;
  readonly redisEnabled: boolean;
  readonly sentryEnabled: boolean;
  readonly skipTraceEnabled: boolean;
  readonly mlRetrainingEnabled: boolean;
  readonly automationEngineEnabled: boolean;
  readonly probateScannerEnabled: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  const cfg = getConfig();
  return {
    geminiEnabled: Boolean(cfg.GEMINI_API_KEY),
    twilioEnabled: Boolean(cfg.TWILIO_ACCOUNT_SID && cfg.TWILIO_AUTH_TOKEN && cfg.TWILIO_FROM_NUMBER),
    sendgridEnabled: Boolean(cfg.SENDGRID_API_KEY && cfg.SENDGRID_FROM_EMAIL),
    telegramEnabled: Boolean(cfg.TELEGRAM_BOT_TOKEN),
    discordEnabled: Boolean(cfg.DISCORD_WEBHOOK_URL),
    redisEnabled: Boolean(cfg.REDIS_URL),
    sentryEnabled: Boolean(cfg.SENTRY_DSN),
    skipTraceEnabled: Boolean(cfg.SKIP_TRACE_API_KEY),
    mlRetrainingEnabled: cfg.ENABLE_ML_RETRAINING && Boolean(cfg.GEMINI_API_KEY),
    automationEngineEnabled: cfg.ENABLE_AUTOMATION_ENGINE,
    probateScannerEnabled: cfg.ENABLE_PROBATE_SCANNER && Boolean(cfg.GEMINI_API_KEY),
  };
}

export const isProduction = (): boolean => getConfig().NODE_ENV === 'production';
export const isDevelopment = (): boolean => getConfig().NODE_ENV === 'development';
export const isTest = (): boolean => getConfig().NODE_ENV === 'test';

import { envSchema } from '@listinglogic/validators';
import { config as loadDotenv } from 'dotenv';

/**
 * Centralized environment validation + nested config shape.
 * The process refuses to start if required variables are missing or malformed.
 *
 * DO NOT read from process.env anywhere else in the codebase — always import from here.
 */

export interface AppConfig {
  readonly env: 'development' | 'staging' | 'production' | 'test';
  readonly port: number;
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;

  readonly firebase: {
    readonly projectId: string;
    readonly clientEmail: string;
    readonly privateKey: string;
  };

  readonly security: {
    readonly jwtSecret: string;
    readonly sessionSecret: string;
    readonly allowedOrigins: readonly string[];
  };

  readonly infrastructure: {
    readonly redis: {
      readonly enabled: boolean;
      readonly url?: string;
    };
    readonly sentry: {
      readonly enabled: boolean;
      readonly dsn?: string;
    };
  };

  readonly integrations: {
    readonly gemini: {
      readonly enabled: boolean;
      readonly apiKey?: string;
    };
    readonly sendgrid: {
      readonly enabled: boolean;
      readonly apiKey?: string;
      readonly fromEmail?: string;
    };
    readonly telegram: {
      readonly enabled: boolean;
      readonly botToken?: string;
    };
    readonly discord: {
      readonly enabled: boolean;
      readonly webhookUrl?: string;
    };
    readonly skipTrace: {
      readonly enabled: boolean;
      readonly apiKey?: string;
    };
  };

  readonly features: {
    readonly mlRetrainingEnabled: boolean;
    readonly automationEngineEnabled: boolean;
    readonly probateScannerEnabled: boolean;
  };

  readonly automation: {
    readonly sweepIntervalMinutes: number;
    readonly maxEmailsPerLeadPerDay: number;
  };
}

let cached: AppConfig | null = null;

function buildConfig(env: ReturnType<typeof envSchema.parse>): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  const isDevelopment = env.NODE_ENV === 'development';
  const isTest = env.NODE_ENV === 'test';

  const sendgridEnabled = Boolean(env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL);
  const geminiEnabled = Boolean(env.GEMINI_API_KEY);

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    isProduction,
    isDevelopment,
    isTest,

    firebase: {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    },

    security: {
      jwtSecret: env.JWT_SECRET,
      sessionSecret: env.SESSION_SECRET,
      allowedOrigins: env.ALLOWED_ORIGINS,
    },

    infrastructure: {
      redis: {
        enabled: Boolean(env.REDIS_URL),
        ...(env.REDIS_URL && { url: env.REDIS_URL }),
      },
      sentry: {
        enabled: Boolean(env.SENTRY_DSN),
        ...(env.SENTRY_DSN && { dsn: env.SENTRY_DSN }),
      },
    },

    integrations: {
      gemini: {
        enabled: geminiEnabled,
        ...(env.GEMINI_API_KEY && { apiKey: env.GEMINI_API_KEY }),
      },
      sendgrid: {
        enabled: sendgridEnabled,
        ...(env.SENDGRID_API_KEY && { apiKey: env.SENDGRID_API_KEY }),
        ...(env.SENDGRID_FROM_EMAIL && { fromEmail: env.SENDGRID_FROM_EMAIL }),
      },
      telegram: {
        enabled: Boolean(env.TELEGRAM_BOT_TOKEN),
        ...(env.TELEGRAM_BOT_TOKEN && { botToken: env.TELEGRAM_BOT_TOKEN }),
      },
      discord: {
        enabled: Boolean(env.DISCORD_WEBHOOK_URL),
        ...(env.DISCORD_WEBHOOK_URL && { webhookUrl: env.DISCORD_WEBHOOK_URL }),
      },
      skipTrace: {
        enabled: Boolean(env.SKIP_TRACE_API_KEY),
        ...(env.SKIP_TRACE_API_KEY && { apiKey: env.SKIP_TRACE_API_KEY }),
      },
    },

    features: {
      mlRetrainingEnabled: env.ENABLE_ML_RETRAINING && geminiEnabled,
      automationEngineEnabled: env.ENABLE_AUTOMATION_ENGINE,
      probateScannerEnabled: env.ENABLE_PROBATE_SCANNER && geminiEnabled,
    },

    automation: {
      sweepIntervalMinutes: env.AUTOMATION_SWEEP_INTERVAL_MINUTES,
      maxEmailsPerLeadPerDay: env.AUTOMATION_MAX_EMAILS_PER_LEAD_PER_DAY,
    },
  };
}

export function loadConfig(): AppConfig {
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

  cached = buildConfig(parsed.data);
  return cached;
}

export function getConfig(): AppConfig {
  if (!cached) {
    throw new Error('Config not loaded. Call loadConfig() at startup.');
  }
  return cached;
}

/**
 * Reset the cached config. Test-only — never call in production code paths.
 */
export function _resetConfigForTests(): void {
  cached = null;
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import winston from 'winston';

/**
 * Correlation-ID aware structured logger.
 *
 * Every log line includes a requestId so you can trace a single request
 * through the entire pipeline (middleware → service → repo → external API).
 *
 * Production: JSON output to stdout (Cloud Logging auto-parses).
 * Development: Pretty-printed colored output.
 */

// ─── Async context for correlation IDs ────────────────────────────────────
interface LogContext {
  readonly requestId: string;
  readonly operatorId?: string;
  readonly route?: string;
  readonly method?: string;
}

const contextStorage = new AsyncLocalStorage<LogContext>();

// ─── PII redaction ────────────────────────────────────────────────────────
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'privatekey',
  'private_key',
  'ssn',
  'creditcard',
  'credit_card',
  'cvv',
  'firebase_private_key',
  'jwt_secret',
  'session_secret',
]);

function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => redactSensitive(item, depth + 1));

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      redacted[key] = `${value.slice(0, 500)}...[TRUNCATED]`;
    } else {
      redacted[key] = redactSensitive(value, depth + 1);
    }
  }
  return redacted;
}

// ─── Custom formatters ────────────────────────────────────────────────────
const contextInjector = winston.format((info) => {
  const ctx = contextStorage.getStore();
  if (ctx) {
    info.requestId = ctx.requestId;
    if (ctx.operatorId) info.operatorId = ctx.operatorId;
    if (ctx.route) info.route = ctx.route;
    if (ctx.method) info.method = ctx.method;
  }
  return info;
});

const redactor = winston.format((info) => {
  // `redactSensitive` rebuilds the object via `Object.entries`, which only
  // copies enumerable string-keyed properties. Winston relies on the
  // Symbol.for('level')/Symbol.for('message') symbols it attaches to `info`
  // for downstream formatters (e.g. colorize) — copy those back over so
  // redaction doesn't silently break them.
  const redacted = redactSensitive(info) as winston.Logform.TransformableInfo;
  for (const sym of Object.getOwnPropertySymbols(info)) {
    (redacted as Record<PropertyKey, unknown>)[sym] = (info as Record<PropertyKey, unknown>)[sym];
  }
  return redacted;
});

const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  contextInjector(),
  redactor(),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, requestId, ...rest }) => {
    const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    // requestId is always a plain string when set (see context.ts) — cast explicitly
    // rather than relying on template-literal coercion, which TS flags as unsafe
    // for a value typed as `unknown` even though it's never actually an object here.
    const requestIdStr = typeof requestId === 'string' ? requestId : undefined;
    const reqId = requestIdStr ? ` [${requestIdStr.slice(0, 8)}]` : '';
    return `${String(timestamp)} ${level}${reqId} ${String(message)}${meta}`;
  }),
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  contextInjector(),
  redactor(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ─── Logger factory ───────────────────────────────────────────────────────
export interface LoggerOptions {
  readonly serviceName: string;
  readonly environment: 'development' | 'staging' | 'production' | 'test';
  readonly logLevel?: string;
}

export function createLogger(options: LoggerOptions): winston.Logger {
  const isDev = options.environment === 'development';
  const isTest = options.environment === 'test';

  return winston.createLogger({
    level: options.logLevel ?? (isDev ? 'debug' : 'info'),
    defaultMeta: {
      service: options.serviceName,
      environment: options.environment,
    },
    format: isDev ? developmentFormat : productionFormat,
    transports: [
      new winston.transports.Console({
        silent: isTest,
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
    exitOnError: false,
  });
}

// ─── Context helpers ──────────────────────────────────────────────────────
export function withContext<T>(context: LogContext, fn: () => T): T {
  return contextStorage.run(context, fn);
}

export function withContextAsync<T>(
  context: LogContext,
  fn: () => Promise<T>,
): Promise<T> {
  return contextStorage.run(context, fn);
}

export function getRequestId(): string | undefined {
  return contextStorage.getStore()?.requestId;
}

export function generateRequestId(): string {
  return randomUUID();
}

export function updateContext(patch: Partial<LogContext>): void {
  const current = contextStorage.getStore();
  if (current) {
    Object.assign(current, patch);
  }
}

// ─── Re-export Winston types for consumers ────────────────────────────────
export type { Logger } from 'winston';

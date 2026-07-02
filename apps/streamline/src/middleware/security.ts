import compression from 'compression';
import cors from 'cors';
import type { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { loadConfig } from '../config/config.js';
import { getLogger } from '../config/logger.js';
import { ForbiddenError } from '../errors/app-errors.js';

/**
 * Composed security middleware stack.
 * Wired into the app in order:
 *   1. Helmet (CSP, XSS, HSTS)
 *   2. CORS (allowlist origins)
 *   3. Compression (gzip)
 *   4. Request sanitization
 */

export function applySecurityMiddleware(app: Application): void {
  const config = loadConfig();
  const logger = getLogger();

  // ─── Helmet — HTTP security headers ────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.twilio.com'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: config.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xPoweredBy: false,
    }),
  );

  // ─── CORS — origin allowlist ───────────────────────────────────────────
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin & tools (no origin header)
        if (!origin) return callback(null, true);

        if (config.security.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        logger.warn('CORS rejection', { origin });
        return callback(new ForbiddenError(`Origin not allowed: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Request-ID',
        'X-Idempotency-Key',
      ],
      exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining', 'Retry-After'],
      maxAge: 86_400,
    }),
  );

  // ─── Compression — gzip responses > 1KB ────────────────────────────────
  app.use(
    compression({
      threshold: 1024,
      filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    }),
  );
}

/**
 * Strip control characters and null bytes from string inputs.
 * Defense against log poisoning and prompt injection.
 */
export function sanitizeRequestMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = deepSanitize(req.query) as typeof req.query;
  }
  next();
}

function deepSanitize(input: unknown, depth = 0): unknown {
  if (depth > 20) return input;
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((item) => deepSanitize(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = deepSanitize(value, depth + 1);
  }
  return out;
}

import express, { type Application, type Router } from 'express';

import { loadConfig } from './config/config.js';
import { getLogger } from './config/logger.js';
import {
  initializeSentry,
  sentryErrorHandler,
  sentryRequestHandler,
  sentryTracingHandler,
} from './config/sentry.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { globalRateLimiter } from './middleware/rate-limit.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { requestLogger } from './middleware/request-logger.js';
import { applySecurityMiddleware, sanitizeRequestMiddleware } from './middleware/security.js';

export interface CreateAppOptions {
  readonly routers: readonly {
    readonly path: string;
    readonly router: Router;
  }[];
}

/**
 * Express app factory.
 *
 * Middleware order matters:
 *   1. Sentry request handler (captures early errors)
 *   2. Request context (requestId, async storage)
 *   3. Security (Helmet, CORS, compression)
 *   4. Body parsers (with 5MB limit)
 *   5. Sanitization
 *   6. Rate limiting
 *   7. Request logger
 *   8. Routes
 *   9. 404 handler
 *  10. Sentry error handler
 *  11. Custom error handler (must be LAST)
 */
export function createApp(options: CreateAppOptions): Application {
  const config = loadConfig();
  const logger = getLogger();
  const app = express();

  // ─── Trust proxy (Cloud Run terminates TLS) ────────────────────────────
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ─── Sentry — must be first ────────────────────────────────────────────
  initializeSentry(app);
  app.use(sentryRequestHandler());
  app.use(sentryTracingHandler());

  // ─── Request context ───────────────────────────────────────────────────
  app.use(requestContextMiddleware);

  // ─── Security stack ────────────────────────────────────────────────────
  applySecurityMiddleware(app);

  // ─── Body parsers with size limits ─────────────────────────────────────
  app.use(express.json({ limit: '5mb', strict: true }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ─── Sanitize inputs ───────────────────────────────────────────────────
  app.use(sanitizeRequestMiddleware);

  // ─── Global rate limit ─────────────────────────────────────────────────
  app.use(globalRateLimiter);

  // ─── Request logging ───────────────────────────────────────────────────
  app.use(requestLogger);

  // ─── Routes ────────────────────────────────────────────────────────────
  for (const { path, router } of options.routers) {
    app.use(path, router);
    logger.debug('Router mounted', { path });
  }

  // ─── 404 for unmatched routes ──────────────────────────────────────────
  app.use(notFoundHandler);

  // ─── Sentry error handler (before our error handler) ───────────────────
  if (config.infrastructure.sentry.enabled) {
    app.use(
      sentryErrorHandler({
        shouldHandleError: (err) => {
          const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
          return statusCode >= 500;
        },
      }),
    );
  }

  // ─── Final error handler ───────────────────────────────────────────────
  app.use(errorHandler);

  logger.info('Express app configured', {
    environment: config.env,
    routes: options.routers.length,
  });

  return app;
}

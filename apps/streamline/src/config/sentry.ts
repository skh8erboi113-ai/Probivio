import * as Sentry from '@sentry/node';


import { loadConfig } from './config.js';
import { getLogger } from './logger.js';

import type { Request } from 'express';

/**
 * Sentry error tracking initialization (Sentry v10, OpenTelemetry-based SDK).
 * No-op in test environment or when SENTRY_DSN is not configured.
 *
 * Unlike the legacy v7 SDK, v10 does not use `Sentry.Handlers.requestHandler()` /
 * `tracingHandler()` middleware — request isolation and tracing are handled
 * automatically by the `httpIntegration`. Error capture for Express is wired via
 * `setupExpressErrorHandler(app)`, which must be called AFTER routes are mounted.
 */

export function initializeSentry(): void {
  const config = loadConfig();
  const logger = getLogger();

  if (!config.infrastructure.sentry.enabled || !config.infrastructure.sentry.dsn) {
    logger.info('Sentry disabled — no DSN configured');
    return;
  }

  Sentry.init({
    dsn: config.infrastructure.sentry.dsn,
    environment: config.env,
    release: process.env.GIT_SHA ?? 'unknown',

    tracesSampleRate: config.isProduction ? 0.1 : 1.0,
    profilesSampleRate: config.isProduction ? 0.1 : 0,

    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],

    beforeSend(event, hint) {
      // Strip sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-api-key'];
      }

      // Drop 4xx errors from Sentry (these are client errors, not bugs)
      const error = hint.originalException;
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        typeof error.statusCode === 'number' &&
        error.statusCode < 500
      ) {
        return null;
      }

      return event;
    },
  });

  logger.info('Sentry initialized', { environment: config.env });
}

/**
 * Wires the Express error handler that reports unhandled/5xx errors to Sentry.
 * Must be called AFTER all routes are mounted but BEFORE the app's own error handler.
 * No-op when Sentry was never initialized.
 */
export function attachSentryErrorHandler(app: Parameters<typeof Sentry.setupExpressErrorHandler>[0]): void {
  const config = loadConfig();
  if (!config.infrastructure.sentry.enabled || !config.infrastructure.sentry.dsn) return;

  Sentry.setupExpressErrorHandler(app, {
    shouldHandleError: (err) => {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      return statusCode >= 500;
    },
  });
}

export function captureRequestException(err: unknown, req: Request): void {
  Sentry.withScope((scope) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- req.route.path is untyped (any) in current Express 5 types
    const routePath: unknown = req.route?.path;
    scope.setTag('route', typeof routePath === 'string' ? routePath : req.path);
    scope.setTag('method', req.method);
    if (req.operatorId) scope.setUser({ id: req.operatorId });
    if (req.requestId) scope.setTag('requestId', req.requestId);
    Sentry.captureException(err);
  });
}

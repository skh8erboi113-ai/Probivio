import * as Sentry from '@sentry/node';
import type { Application, Request } from 'express';

import { loadConfig } from './config.js';
import { getLogger } from './logger.js';

/**
 * Sentry error tracking initialization.
 * No-op in test environment or when SENTRY_DSN is not configured.
 */

export function initializeSentry(app: Application): void {
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

    integrations: [
      Sentry.httpIntegration({ tracing: true }),
      Sentry.expressIntegration({ app }),
    ],

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

export function captureRequestException(err: unknown, req: Request): void {
  Sentry.withScope((scope) => {
    scope.setTag('route', req.route?.path ?? req.path);
    scope.setTag('method', req.method);
    if (req.operatorId) scope.setUser({ id: req.operatorId });
    if (req.requestId) scope.setTag('requestId', req.requestId);
    Sentry.captureException(err);
  });
}

export const sentryRequestHandler = Sentry.Handlers.requestHandler;
export const sentryTracingHandler = Sentry.Handlers.tracingHandler;
export const sentryErrorHandler = Sentry.Handlers.errorHandler;

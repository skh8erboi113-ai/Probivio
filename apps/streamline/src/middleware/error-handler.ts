import type { ApiError } from '@listinglogic/types';
import type { NextFunction, Request, Response } from 'express';

import { loadConfig } from '../config/config.js';
import { getLogger } from '../config/logger.js';
import { captureRequestException } from '../config/sentry.js';
import { isAppError, InternalError, PayloadTooLargeError, ValidationError } from '../errors/app-errors.js';

/**
 * Central error handler. MUST be registered last in the middleware chain.
 *
 * Responsibilities:
 *   1. Convert domain errors to consistent HTTP responses
 *   2. Never leak stack traces in production
 *   3. Send unexpected errors to Sentry
 *   4. Log all errors with request context
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const config = loadConfig();
  const logger = getLogger();

  // ─── Body-parser errors ────────────────────────────────────────────────
  if (err && typeof err === 'object' && 'type' in err) {
    const errType = String(err.type);
    if (errType === 'entity.too.large') {
      const e = new PayloadTooLargeError('5MB');
      return respond(res, req, e);
    }
    if (errType === 'entity.parse.failed') {
      const e = new ValidationError('Invalid JSON body');
      return respond(res, req, e);
    }
  }

  // ─── Known app errors ──────────────────────────────────────────────────
  if (isAppError(err)) {
    if (err.statusCode >= 500) {
      logger.error('App error (5xx)', {
        error: err.toJSON(),
        stack: err.stack,
        path: req.path,
      });
      captureRequestException(err, req);
    } else {
      logger.info('App error (4xx)', {
        code: err.code,
        message: err.message,
        path: req.path,
      });
    }
    return respond(res, req, err);
  }

  // ─── Unknown errors — treat as 500 ─────────────────────────────────────
  const unknownError = err instanceof Error ? err : new Error(String(err));
  logger.error('Unhandled error', {
    error: {
      name: unknownError.name,
      message: unknownError.message,
      stack: unknownError.stack,
    },
    path: req.path,
    method: req.method,
  });

  captureRequestException(unknownError, req);

  const internal = new InternalError(
    config.isProduction ? 'An unexpected error occurred' : unknownError.message,
    unknownError,
  );
  respond(res, req, internal);
}

/**
 * 404 handler — catches unmatched routes.
 * Must be registered after all routes but before error handler.
 */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiError = {
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
    },
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  };
  res.status(404).json(body);
}

function respond(res: Response, req: Request, err: ReturnType<typeof isAppError> extends true ? never : never): void;
function respond(
  res: Response,
  req: Request,
  err: {
    readonly statusCode: number;
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  },
): void;
function respond(
  res: Response,
  req: Request,
  err: {
    readonly statusCode: number;
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  },
): void {
  const body: ApiError = {
    error: {
      code: err.code as ApiError['error']['code'],
      message: err.message,
      ...(err.details && { details: err.details }),
    },
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  };
  res.status(err.statusCode).json(body);
}

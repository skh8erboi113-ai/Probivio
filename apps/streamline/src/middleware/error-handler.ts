import {
  ConflictError as DbConflictError,
  DatabaseError,
  ForbiddenError as DbForbiddenError,
  NotFoundError as DbNotFoundError,
  OptimisticLockError,
  RepositoryError,
} from '@listinglogic/db';

import { loadConfig } from '../config/config.js';
import { getLogger } from '../config/logger.js';
import { captureRequestException } from '../config/sentry.js';
import { isAppError, InternalError, PayloadTooLargeError, ValidationError } from '../errors/app-errors.js';

import type { ApiError } from '@listinglogic/types';
import type { NextFunction, Request, Response } from 'express';

/**
 * `@listinglogic/db` repository errors are a separate hierarchy from
 * `AppError` (see errors/app-errors.ts) — map them to the same HTTP
 * status/code shape so a `NotFoundError` thrown by a repository doesn't
 * fall through to a generic 500.
 */
function repositoryErrorStatus(err: RepositoryError): { readonly statusCode: number; readonly code: string } {
  if (err instanceof DbNotFoundError) return { statusCode: 404, code: 'NOT_FOUND' };
  if (err instanceof DbForbiddenError) return { statusCode: 403, code: 'FORBIDDEN' };
  if (err instanceof DbConflictError) return { statusCode: 409, code: 'CONFLICT' };
  if (err instanceof OptimisticLockError) return { statusCode: 409, code: 'CONFLICT' };
  if (err instanceof DatabaseError) return { statusCode: 500, code: 'DATABASE_ERROR' };
  return { statusCode: 500, code: 'DATABASE_ERROR' };
}

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

  // ─── Repository errors (@listinglogic/db) ──────────────────────────────
  if (err instanceof RepositoryError) {
    const { statusCode, code } = repositoryErrorStatus(err);
    if (statusCode >= 500) {
      logger.error('Repository error (5xx)', { error: err.toJSON(), stack: err.stack, path: req.path });
      captureRequestException(err, req);
    } else {
      logger.info('Repository error (4xx)', { code, message: err.message, path: req.path });
    }
    return respond(res, req, { statusCode, code, message: err.message });
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

interface RespondableError {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown> | undefined;
}

function respond(res: Response, req: Request, err: RespondableError): void {
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

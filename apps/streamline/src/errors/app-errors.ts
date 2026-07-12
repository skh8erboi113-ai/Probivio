import { ErrorCode } from '@listinglogic/types';

/**
 * Domain-layer error hierarchy. HTTP layer maps these to status codes.
 *
 * NEVER leak these directly to clients — always go through the error handler
 * middleware which translates them to safe API responses.
 */

export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly code: ErrorCode;
  public override readonly name: string;
  public readonly isOperational: boolean = true;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// ─── 400 Bad Request ─────────────────────────────────────────────────────
export class ValidationError extends AppError {
  public readonly statusCode = 422;
  public readonly code = ErrorCode.VALIDATION_ERROR;
}

// ─── 401 Unauthorized ────────────────────────────────────────────────────
export class UnauthorizedError extends AppError {
  public readonly statusCode = 401;
  public readonly code = ErrorCode.UNAUTHORIZED;

  constructor(message = 'Authentication required') {
    super(message);
  }
}

// ─── 403 Forbidden ───────────────────────────────────────────────────────
export class ForbiddenError extends AppError {
  public readonly statusCode = 403;
  public readonly code = ErrorCode.FORBIDDEN;

  constructor(message = 'Access denied') {
    super(message);
  }
}

// ─── 404 Not Found ───────────────────────────────────────────────────────
export class NotFoundError extends AppError {
  public readonly statusCode = 404;
  public readonly code = ErrorCode.NOT_FOUND;

  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`);
  }
}

// ─── 409 Conflict ────────────────────────────────────────────────────────
export class ConflictError extends AppError {
  public readonly statusCode = 409;
  public readonly code = ErrorCode.CONFLICT;
}

// ─── 413 Payload Too Large ───────────────────────────────────────────────
export class PayloadTooLargeError extends AppError {
  public readonly statusCode = 413;
  public readonly code = ErrorCode.PAYLOAD_TOO_LARGE;

  constructor(limit: string) {
    super(`Request body exceeds ${limit} limit`);
  }
}

// ─── 429 Rate Limited ────────────────────────────────────────────────────
export class RateLimitError extends AppError {
  public readonly statusCode = 429;
  public readonly code = ErrorCode.RATE_LIMITED;

  constructor(retryAfter: number) {
    super('Rate limit exceeded', { retryAfterSeconds: retryAfter });
  }
}

// ─── 500 Internal ────────────────────────────────────────────────────────
export class InternalError extends AppError {
  public readonly statusCode = 500;
  public readonly code = ErrorCode.INTERNAL_ERROR;
  public override readonly isOperational: boolean;

  constructor(message = 'Internal server error', cause?: unknown, operational = false) {
    super(message, undefined, cause);
    this.isOperational = operational;
  }
}

// ─── 502 External API ────────────────────────────────────────────────────
export class ExternalApiError extends AppError {
  public readonly statusCode = 502;
  public readonly code = ErrorCode.EXTERNAL_API_ERROR;

  constructor(service: string, cause?: unknown) {
    super(`External service ${service} failed`, { service }, cause);
  }
}

// ─── 503 Service Unavailable ─────────────────────────────────────────────
export class CircuitOpenError extends AppError {
  public readonly statusCode = 503;
  public readonly code = ErrorCode.CIRCUIT_OPEN;

  constructor(service: string) {
    super(`Service ${service} temporarily unavailable`, { service });
  }
}

/**
 * Type guard used by the error handler.
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

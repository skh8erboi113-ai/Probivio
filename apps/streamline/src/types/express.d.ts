import type { OperatorId } from '@listinglogic/types';

/**
 * Extends Express types to include our per-request context.
 * Set by the auth middleware and request-id middleware.
 */

declare global {
  namespace Express {
    interface Request {
      /** Correlation ID for tracing (set by requestId middleware) */
      requestId: string;

      /** Authenticated operator (set by auth middleware) */
      operatorId: OperatorId;

      /** Firebase UID (== operatorId) */
      uid: string;

      /** Firebase custom claims from the JWT */
      claims: Record<string, unknown>;

      /** Time the request entered the app (for latency logging) */
      startTime: number;

      /** Idempotency key (if provided by client) */
      idempotencyKey?: string;
    }
  }
}

export {};

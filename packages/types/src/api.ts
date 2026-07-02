/**
 * Standard API response envelopes.
 * All Streamline HTTP responses conform to these shapes.
 */

// ─── Success ──────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  readonly data: T;
  readonly message?: string;
  readonly requestId: string;
}

export interface ApiListResponse<T> {
  readonly data: readonly T[];
  readonly pagination: {
    readonly total: number;
    readonly page: number;
    readonly limit: number;
    readonly hasMore: boolean;
  };
  readonly requestId: string;
}

// ─── Errors ───────────────────────────────────────────────────────────────
export const ErrorCode = {
  // 4xx
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',

  // 5xx
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly field?: string;
  };
  readonly requestId: string;
  readonly timestamp: string;
}

// ─── Health check ─────────────────────────────────────────────────────────
export interface HealthResponse {
  readonly status: 'ok' | 'degraded' | 'down';
  readonly version: string;
  readonly uptime: number;                      // seconds
  readonly timestamp: string;
  readonly checks: {
    readonly firestore: 'ok' | 'degraded' | 'down';
    readonly redis: 'ok' | 'degraded' | 'down' | 'disabled';
    readonly gemini: 'ok' | 'degraded' | 'down' | 'disabled';
  };
}

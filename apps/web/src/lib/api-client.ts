import type { ApiError } from '@listinglogic/types';

import { getEnv } from './env';
import { getFirebaseAuth } from './firebase';

/**
 * Typed HTTP client for the Streamline API.
 *
 * - Attaches Firebase ID token to every request
 * - Adds correlation ID for tracing
 * - Parses error envelopes into ApiClientError
 * - Handles 401 by triggering re-auth flow
 */

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  public isValidation(): boolean {
    return this.status === 422;
  }

  public isUnauthorized(): boolean {
    return this.status === 401;
  }

  public isNotFound(): boolean {
    return this.status === 404;
  }

  public isRateLimited(): boolean {
    return this.status === 429;
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

function generateRequestId(): string {
  return crypto.randomUUID();
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const env = getEnv();
  const requestId = generateRequestId();
  const authHeader = await getAuthHeader();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    ...authHeader,
  };

  if (options.idempotencyKey) {
    headers['X-Idempotency-Key'] = options.idempotencyKey;
  }

  const res = await fetch(`${env.VITE_API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const errBody = body as Partial<ApiError> | null;
    throw new ApiClientError(
      res.status,
      errBody?.error?.code ?? 'UNKNOWN',
      errBody?.error?.message ?? `HTTP ${res.status}`,
      errBody?.error?.details,
      errBody?.requestId,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),

  post: <T>(path: string, body: unknown, idempotencyKey?: string) =>
    request<T>(path, { method: 'POST', body, ...(idempotencyKey && { idempotencyKey }) }),

  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),

  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};

export function buildQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, String(v)));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
                      }

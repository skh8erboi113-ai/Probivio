import type { ApiError } from '@listinglogic/types';

import { env } from '../config/env';
import { getFirebaseAuth } from '../config/firebase';

/**
 * Typed HTTP client with:
 *   - Automatic Firebase ID token attachment
 *   - Structured error handling
 *   - Request ID correlation
 *   - Timeout protection
 */

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  public get isValidationError(): boolean {
    return this.code === 'VALIDATION_ERROR';
  }

  public get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  public get isNotFound(): boolean {
    return this.status === 404;
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function getAuthHeader(): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

function buildQueryString(params: Record<string, unknown>): string {
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const authHeader = await getAuthHeader();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const combinedSignal = signal
    ? new AbortController()
    : controller;

  if (signal) {
    signal.addEventListener('abort', () => combinedSignal.abort());
    controller.signal.addEventListener('abort', () => combinedSignal.abort());
  }

  try {
    const url = `${env.apiUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeader,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: combinedSignal.signal,
      credentials: 'same-origin',
    });

    clearTimeout(timeoutId);

    if (res.status === 204) return undefined as T;

    const requestId = res.headers.get('x-request-id') ?? 'unknown';
    const contentType = res.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      throw new ApiClientError(
        `Non-JSON response (${res.status})`,
        res.status,
        'INTERNAL_ERROR',
        requestId,
      );
    }

    const json = (await res.json()) as unknown;

    if (!res.ok) {
      const errorBody = json as ApiError;
      throw new ApiClientError(
        errorBody.error?.message ?? `HTTP ${res.status}`,
        res.status,
        errorBody.error?.code ?? 'INTERNAL_ERROR',
        errorBody.requestId ?? requestId,
        errorBody.error?.details,
      );
    }

    return json as T;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof ApiClientError) throw err;

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError('Request timeout', 408, 'TIMEOUT', 'unknown');
    }

    if (err instanceof TypeError) {
      throw new ApiClientError('Network error', 0, 'NETWORK_ERROR', 'unknown');
    }

    throw err;
  }
}

export const api = {
  get<T>(path: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    const query = params ? buildQueryString(params) : '';
    return request<T>(`${path}${query}`, { ...options, method: 'GET' });
  },

  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', body });
  },

  patch<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'PATCH', body });
  },

  delete(path: string, options?: RequestOptions): Promise<void> {
    return request<void>(path, { ...options, method: 'DELETE' });
  },
};

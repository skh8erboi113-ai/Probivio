import type { Logger } from '@listinglogic/logger';

/**
 * Exponential backoff with jitter.
 * Retries only on transient errors — 5xx, 429, network failures.
 * Never retries on 4xx client errors.
 */

export interface RetryOptions {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly jitterFactor: number;
  readonly isRetryable: (err: unknown) => boolean;
  readonly logger?: Logger;
  readonly operationName?: string;
}

const DEFAULT_OPTIONS: Omit<RetryOptions, 'isRetryable'> = {
  maxAttempts: 3,
  initialDelayMs: 200,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.25,
};

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> & { readonly isRetryable: RetryOptions['isRetryable'] },
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      const canRetry = attempt < opts.maxAttempts && opts.isRetryable(err);
      if (!canRetry) throw err;

      const baseDelay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs,
      );
      const jitter = baseDelay * opts.jitterFactor * (Math.random() * 2 - 1);
      const delay = Math.max(0, baseDelay + jitter);

      opts.logger?.warn('Retrying operation', {
        operation: opts.operationName,
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: Math.round(delay),
        error: err instanceof Error ? err.message : String(err),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Common predicates for isRetryable.
 */
export const RetryPredicates = {
  networkOrServerError: (err: unknown): boolean => {
    if (err instanceof Error) {
      if (err.message.includes('ECONNRESET')) return true;
      if (err.message.includes('ETIMEDOUT')) return true;
      if (err.message.includes('ENOTFOUND')) return true;
    }
    if (err && typeof err === 'object' && 'status' in err) {
      const status = Number(err.status);
      return status === 429 || (status >= 500 && status < 600);
    }
    return false;
  },
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

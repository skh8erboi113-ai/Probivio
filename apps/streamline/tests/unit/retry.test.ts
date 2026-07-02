import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '../../src/services/retry';

describe('retryWithBackoff', () => {
  it('retries transient failures and eventually succeeds', async () => {
    let calls = 0;

    const op = async () => {
      calls++;
      if (calls < 3) {
        // Simulate transient server error
        throw Object.assign(new Error('server error'), { status: 500 });
      }
      return 'ok';
    };

    const result = await retryWithBackoff(op, {
      maxAttempts: 3,
      initialDelayMs: 1,
      maxDelayMs: 2,
      backoffMultiplier: 1,
      jitterFactor: 0,
      operationName: 'test-op',
      isRetryable: (err) => {
        const status = Number((err as any)?.status);
        return status === 429 || (status >= 500 && status < 600);
      },
      logger: {
        warn: vi.fn(),
      } as any,
    });

    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });
});

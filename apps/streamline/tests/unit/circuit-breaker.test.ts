import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

import { CircuitBreaker } from '../../src/services/circuit-breaker';

describe('CircuitBreaker', () => {
  it('opens after threshold and then closes after reset timeout on success', async () => {
    vi.useFakeTimers();

    const logger = {
      child: () => logger,
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    const breaker = new CircuitBreaker({
      serviceName: 'test-svc',
      failureThreshold: 2,
      resetTimeoutMs: 1000,
      halfOpenRequests: 1,
      logger,
    });

    const failOp = async () => {
      throw new Error('boom');
    };

    await expect(breaker.execute(failOp)).rejects.toThrow('boom');
    await expect(breaker.execute(failOp)).rejects.toThrow('boom');

    // Now it should be OPEN
    await expect(breaker.execute(async () => 'ok')).rejects.toThrow(/temporarily unavailable/i);

    vi.advanceTimersByTime(1001);

    // HALF_OPEN probe: next success should close it
    const val = await breaker.execute(async () => 'ok');
    expect(val).toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
  });
});

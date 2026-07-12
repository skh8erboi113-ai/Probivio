import { CircuitOpenError } from '../errors/app-errors.js';

import type { Logger } from '@probivio/logger';


/**
 * Circuit breaker for external service calls.
 *
 * States:
 *   CLOSED   — normal operation, requests pass through
 *   OPEN     — failure threshold exceeded, requests fail fast
 *   HALF_OPEN — recovery probe, one request allowed to test the waters
 *
 * Prevents cascading failures when Gemini/SendGrid degrade.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  readonly serviceName: string;
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly halfOpenRequests: number;
  readonly logger: Logger;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureAt = 0;
  private halfOpenAttempts = 0;

  private readonly serviceName: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenRequests: number;
  private readonly logger: Logger;

  constructor(options: CircuitBreakerOptions) {
    this.serviceName = options.serviceName;
    this.failureThreshold = options.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs;
    this.halfOpenRequests = options.halfOpenRequests;
    this.logger = options.logger.child({ circuit: options.serviceName });
  }

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureAt >= this.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitOpenError(this.serviceName);
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.halfOpenRequests) {
      throw new CircuitOpenError(this.serviceName);
    }

    if (this.state === 'HALF_OPEN') this.halfOpenAttempts++;

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  public getState(): CircuitState {
    return this.state;
  }

  private recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
    this.failureCount = 0;
  }

  private recordFailure(err: unknown): void {
    this.failureCount++;
    this.lastFailureAt = Date.now();

    this.logger.warn('Circuit breaker recorded failure', {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      error: err instanceof Error ? err.message : String(err),
    });

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitState): void {
    this.logger.info('Circuit breaker state change', {
      from: this.state,
      to: newState,
    });
    this.state = newState;

    if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.halfOpenAttempts = 0;
    }
    if (newState === 'HALF_OPEN') {
      this.halfOpenAttempts = 0;
    }
  }
}

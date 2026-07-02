import type { Logger } from '@listinglogic/logger';

import { loadConfig } from '../config/config.js';
import { ExternalApiError, InternalError } from '../errors/app-errors.js';

import { CircuitBreaker } from './circuit-breaker.js';
import { RetryPredicates, retryWithBackoff } from './retry.js';

/**
 * Skip trace service — 3-tier fallback chain per whitepaper spec.
 *
 * Primary: TLOxp / LexisNexis (highest quality, most expensive)
 * Secondary: BeenVerified (mid-tier)
 * Tertiary: Free public records scraper (last resort, lowest confidence)
 *
 * Each tier has its own circuit breaker so a single provider outage doesn't
 * cascade. Results are normalized to a common shape.
 */

export interface SkipTraceInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly zip?: string;
}

export interface SkipTraceResult {
  readonly source: 'primary' | 'secondary' | 'tertiary' | 'none';
  readonly confidence: number;
  readonly phones: readonly SkipTracePhone[];
  readonly emails: readonly string[];
  readonly addresses: readonly string[];
  readonly age?: number;
  readonly relatives: readonly string[];
}

export interface SkipTracePhone {
  readonly number: string;
  readonly type: 'mobile' | 'landline' | 'voip' | 'unknown';
  readonly isPrimary: boolean;
  readonly dncListed: boolean;
}

const EMPTY_RESULT: SkipTraceResult = {
  source: 'none',
  confidence: 0,
  phones: [],
  emails: [],
  addresses: [],
  relatives: [],
};

export class SkipTraceService {
  private readonly primaryCircuit: CircuitBreaker;
  private readonly secondaryCircuit: CircuitBreaker;
  private readonly tertiaryCircuit: CircuitBreaker;
  private readonly apiKey: string | null;
  private readonly logger: Logger;
  private readonly enabled: boolean;

  constructor(logger: Logger) {
    const config = loadConfig();
    this.logger = logger.child({ service: 'skip-trace' });
    this.enabled = config.integrations.skipTrace.enabled;
    this.apiKey = config.integrations.skipTrace.apiKey ?? null;

    const circuitOpts = {
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
      halfOpenRequests: 1,
      logger: this.logger,
    };

    this.primaryCircuit = new CircuitBreaker({ ...circuitOpts, serviceName: 'skip-trace-primary' });
    this.secondaryCircuit = new CircuitBreaker({ ...circuitOpts, serviceName: 'skip-trace-secondary' });
    this.tertiaryCircuit = new CircuitBreaker({ ...circuitOpts, serviceName: 'skip-trace-tertiary' });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public async lookup(input: SkipTraceInput): Promise<SkipTraceResult> {
    if (!this.enabled || !this.apiKey) {
      this.logger.debug('Skip trace disabled — returning empty');
      return EMPTY_RESULT;
    }

    // Try primary
    try {
      const primary = await this.primaryCircuit.execute(() =>
        retryWithBackoff(() => this.callPrimary(input), {
          maxAttempts: 2,
          initialDelayMs: 500,
          isRetryable: RetryPredicates.networkOrServerError,
          logger: this.logger,
          operationName: 'skip-trace.primary',
        }),
      );
      if (primary.confidence >= 0.7) return primary;
    } catch (err) {
      this.logger.warn('Skip trace primary failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fall through to secondary
    try {
      const secondary = await this.secondaryCircuit.execute(() =>
        retryWithBackoff(() => this.callSecondary(input), {
          maxAttempts: 2,
          initialDelayMs: 500,
          isRetryable: RetryPredicates.networkOrServerError,
          logger: this.logger,
          operationName: 'skip-trace.secondary',
        }),
      );
      if (secondary.confidence >= 0.5) return secondary;
    } catch (err) {
      this.logger.warn('Skip trace secondary failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fall through to tertiary
    try {
      return await this.tertiaryCircuit.execute(() =>
        retryWithBackoff(() => this.callTertiary(input), {
          maxAttempts: 1,
          initialDelayMs: 0,
          isRetryable: () => false,
          logger: this.logger,
          operationName: 'skip-trace.tertiary',
        }),
      );
    } catch (err) {
      this.logger.warn('All skip trace tiers exhausted', {
        error: err instanceof Error ? err.message : String(err),
      });
      return EMPTY_RESULT;
    }
  }

  private async callPrimary(input: SkipTraceInput): Promise<SkipTraceResult> {
    // Placeholder for TLOxp / LexisNexis integration.
    // Replace with real API call when credentials are provisioned.
    if (!this.apiKey) throw new InternalError('Skip trace API key missing', undefined, true);

    // Simulated response shape — swap for real client
    const simulated: SkipTraceResult = {
      source: 'primary',
      confidence: 0.85,
      phones: [
        { number: `+1555${Math.floor(Math.random() * 10000000)}`, type: 'mobile', isPrimary: true, dncListed: false },
      ],
      emails: [`${input.firstName.toLowerCase()}.${input.lastName.toLowerCase()}@example.com`],
      addresses: input.address ? [input.address] : [],
      relatives: [],
    };
    return simulated;
  }

  private async callSecondary(input: SkipTraceInput): Promise<SkipTraceResult> {
    // Placeholder for BeenVerified / Whitepages Pro
    return {
      source: 'secondary',
      confidence: 0.6,
      phones: [],
      emails: [],
      addresses: input.address ? [input.address] : [],
      relatives: [],
    };
  }

  private async callTertiary(_input: SkipTraceInput): Promise<SkipTraceResult> {
    // Public records fallback — very low confidence
    return { ...EMPTY_RESULT, source: 'tertiary', confidence: 0.2 };
  }

  private async httpCall<T>(url: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new ExternalApiError('skip-trace', `HTTP ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createSkipTraceService(logger: Logger): SkipTraceService {
  return new SkipTraceService(logger);
}

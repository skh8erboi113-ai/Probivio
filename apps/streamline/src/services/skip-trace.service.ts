import { SkipTraceStatus } from '@probivio/types';

import { loadConfig } from '../config/config.js';
import { ExternalApiError } from '../errors/app-errors.js';

import { CircuitBreaker } from './circuit-breaker.js';
import { RetryPredicates, retryWithBackoff } from './retry.js';

import type { Logger } from '@probivio/logger';
import type { SkipTraceInput, SkipTraceResult, SkipTracePhone } from '@probivio/types';

/**
 * Skip trace service — real provider integration (BatchData property skip
 * trace API: https://developer.batchdata.com), not simulated data.
 *
 * Earlier versions of this service returned fabricated phone numbers/emails
 * whenever skip trace was invoked, which is unacceptable for a product that
 * hands this data to a real operator who will call/text/email a real person.
 * If no provider is configured, or the provider call fails, this service now
 * says so explicitly via `SkipTraceResult.status` — it never invents contact
 * info. The frontend is responsible for surfacing that status honestly
 * (see SkipTraceCard in LeadDetailPage) instead of presenting a "result" as
 * if it were verified data.
 */

const PROVIDER_NAME = 'batchdata';
const BATCHDATA_ENDPOINT = 'https://api.batchdata.com/api/v1/property/skip-trace';

interface BatchDataPhone {
  readonly number: string;
  readonly type?: string;
  readonly reachable?: boolean;
  readonly score?: string | number;
}

interface BatchDataPerson {
  readonly emails?: readonly { readonly email: string }[];
  readonly phoneNumbers?: readonly BatchDataPhone[];
  readonly dnc?: { readonly landline?: boolean; readonly mobile?: boolean };
  readonly mailingAddress?: { readonly street?: string; readonly city?: string; readonly state?: string; readonly zip?: string };
  readonly meta?: { readonly matched?: boolean };
}

interface BatchDataResponse {
  readonly results?: {
    readonly persons?: readonly BatchDataPerson[];
  };
}

function notConfigured(): SkipTraceResult {
  return {
    status: SkipTraceStatus.NOT_CONFIGURED,
    provider: null,
    confidence: 0,
    phones: [],
    emails: [],
    tracedAt: new Date().toISOString(),
  };
}

function notFound(provider: string): SkipTraceResult {
  return {
    status: SkipTraceStatus.NOT_FOUND,
    provider,
    confidence: 0,
    phones: [],
    emails: [],
    tracedAt: new Date().toISOString(),
  };
}

function unavailable(provider: string): SkipTraceResult {
  return {
    status: SkipTraceStatus.UNAVAILABLE,
    provider,
    confidence: 0,
    phones: [],
    emails: [],
    tracedAt: new Date().toISOString(),
  };
}

function normalizePhoneType(raw: string | undefined): SkipTracePhone['type'] {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('mobile') || t.includes('wireless')) return 'mobile';
  if (t.includes('land')) return 'landline';
  if (t.includes('voip')) return 'voip';
  return 'unknown';
}

export class SkipTraceService {
  private readonly circuit: CircuitBreaker;
  private readonly apiKey: string | null;
  private readonly logger: Logger;
  private readonly enabled: boolean;

  constructor(logger: Logger) {
    const config = loadConfig();
    this.logger = logger.child({ service: 'skip-trace', provider: PROVIDER_NAME });
    this.enabled = config.integrations.skipTrace.enabled;
    this.apiKey = config.integrations.skipTrace.apiKey ?? null;

    this.circuit = new CircuitBreaker({
      serviceName: 'skip-trace-batchdata',
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
      halfOpenRequests: 1,
      logger: this.logger,
    });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public async lookup(input: SkipTraceInput): Promise<SkipTraceResult> {
    if (!this.enabled || !this.apiKey) {
      this.logger.debug('Skip trace not configured — no API key present');
      return notConfigured();
    }

    try {
      return await this.circuit.execute(() =>
        retryWithBackoff(() => this.callBatchData(input), {
          maxAttempts: 2,
          initialDelayMs: 500,
          isRetryable: RetryPredicates.networkOrServerError,
          logger: this.logger,
          operationName: 'skip-trace.batchdata',
        }),
      );
    } catch (err) {
      this.logger.warn('Skip trace provider call failed — returning unavailable, never fabricated data', {
        error: err instanceof Error ? err.message : String(err),
      });
      return unavailable(PROVIDER_NAME);
    }
  }

  private async callBatchData(input: SkipTraceInput): Promise<SkipTraceResult> {
    if (!input.address || !input.city || !input.state || !input.zip) {
      // BatchData requires a full property address (street+city+state or
      // street+zip at minimum). Without one we can't call the provider at
      // all — this is a "not found" outcome, not a provider failure.
      return notFound(PROVIDER_NAME);
    }

    const body = {
      requests: [
        {
          propertyAddress: {
            street: input.address,
            city: input.city,
            state: input.state,
            zip: input.zip,
          },
          ...(input.firstName || input.lastName
            ? { name: { first: input.firstName, last: input.lastName } }
            : {}),
        },
      ],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    let res: Response;
    try {
      res = await fetch(BATCHDATA_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      throw new ExternalApiError(PROVIDER_NAME, `HTTP ${res.status}`);
    }

    const json = (await res.json()) as BatchDataResponse;
    const person = json.results?.persons?.[0];

    if (!person || person.meta?.matched === false) {
      return notFound(PROVIDER_NAME);
    }

    const phones: SkipTracePhone[] = (person.phoneNumbers ?? []).map((p, idx) => ({
      number: p.number,
      type: normalizePhoneType(p.type),
      isPrimary: idx === 0,
      dncListed: Boolean(person.dnc?.mobile || person.dnc?.landline),
    }));
    const emails = (person.emails ?? []).map((e) => e.email);

    const mailingAddress = person.mailingAddress
      ? [person.mailingAddress.street, person.mailingAddress.city, person.mailingAddress.state, person.mailingAddress.zip]
          .filter(Boolean)
          .join(', ')
      : undefined;

    if (phones.length === 0 && emails.length === 0) {
      return notFound(PROVIDER_NAME);
    }

    // Confidence heuristic: provider gives a per-phone reachability score
    // (0-100); use the best phone score if present, otherwise a flat value
    // reflecting "matched, but no reachability signal available".
    const bestScore = Math.max(
      0,
      ...(person.phoneNumbers ?? []).map((p) => (typeof p.score === 'string' ? Number(p.score) : (p.score ?? 0))),
    );
    const confidence = bestScore > 0 ? Math.min(1, bestScore / 100) : 0.5;

    return {
      status: SkipTraceStatus.FOUND,
      provider: PROVIDER_NAME,
      confidence,
      phones,
      emails,
      ...(mailingAddress && { mailingAddress }),
      tracedAt: new Date().toISOString(),
    };
  }
}

export function createSkipTraceService(logger: Logger): SkipTraceService {
  return new SkipTraceService(logger);
}

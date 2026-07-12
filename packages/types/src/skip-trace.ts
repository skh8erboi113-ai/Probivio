/**
 * Skip trace — looking up a property owner's current contact info from
 * public/commercial data sources when the CRM only has an address on file.
 *
 * `status` tells the UI exactly what happened so it can render an honest
 * state instead of presenting placeholder data as if it were real:
 *   - 'found'         — a real provider call succeeded and returned data.
 *   - 'not_found'      — the provider call succeeded but had no match.
 *   - 'not_configured' — no provider API key is set up for this environment.
 *   - 'unavailable'    — the provider is reachable in principle but the call
 *                        failed (timeout, 5xx, circuit open) — try again later.
 */
export const SkipTraceStatus = {
  FOUND: 'found',
  NOT_FOUND: 'not_found',
  NOT_CONFIGURED: 'not_configured',
  UNAVAILABLE: 'unavailable',
} as const;
export type SkipTraceStatus = (typeof SkipTraceStatus)[keyof typeof SkipTraceStatus];

export interface SkipTraceInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly zip?: string;
}

export interface SkipTracePhone {
  readonly number: string;
  readonly type: 'mobile' | 'landline' | 'voip' | 'unknown';
  readonly isPrimary: boolean;
  readonly dncListed: boolean;
}

export interface SkipTraceResult {
  readonly status: SkipTraceStatus;
  /** Which provider produced this result, e.g. "batchdata". Null when not_configured. */
  readonly provider: string | null;
  readonly confidence: number;
  readonly phones: readonly SkipTracePhone[];
  readonly emails: readonly string[];
  readonly mailingAddress?: string;
  readonly tracedAt: string;
}

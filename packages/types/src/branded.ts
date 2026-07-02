/**
 * Branded types — nominal typing for IDs to prevent accidental cross-use.
 *
 * @example
 *   const leadId: LeadId = 'lead_abc' as LeadId;
 *   const buyerId: BuyerId = leadId; // ❌ Type error
 */

declare const __brand: unique symbol;

export type Branded<T, B> = T & { readonly [__brand]: B };

export type OperatorId = Branded<string, 'OperatorId'>;
export type LeadId = Branded<string, 'LeadId'>;
export type BuyerId = Branded<string, 'BuyerId'>;
export type ProbateCaseId = Branded<string, 'ProbateCaseId'>;
export type AutomationId = Branded<string, 'AutomationId'>;
export type InteractionId = Branded<string, 'InteractionId'>;
export type ScoreHistoryId = Branded<string, 'ScoreHistoryId'>;
export type CorrelationId = Branded<string, 'CorrelationId'>;

/** Runtime brand constructors — no-op at runtime, adds compile-time safety. */
export const OperatorId = (id: string): OperatorId => id as OperatorId;
export const LeadId = (id: string): LeadId => id as LeadId;
export const BuyerId = (id: string): BuyerId => id as BuyerId;
export const ProbateCaseId = (id: string): ProbateCaseId => id as ProbateCaseId;
export const AutomationId = (id: string): AutomationId => id as AutomationId;
export const InteractionId = (id: string): InteractionId => id as InteractionId;
export const ScoreHistoryId = (id: string): ScoreHistoryId => id as ScoreHistoryId;
export const CorrelationId = (id: string): CorrelationId => id as CorrelationId;

/**
 * ISO 8601 timestamp with format guarantee.
 * @example '2026-07-15T14:32:00.000Z'
 */
export type IsoTimestamp = Branded<string, 'IsoTimestamp'>;
export const IsoTimestamp = (date: Date = new Date()): IsoTimestamp =>
  date.toISOString() as IsoTimestamp;

/** US State two-letter code (e.g., "TX"). */
export type UsStateCode = Branded<string, 'UsStateCode'>;

/** US ZIP code — 5-digit or ZIP+4. */
export type ZipCode = Branded<string, 'ZipCode'>;

/** E.164 formatted phone number. */
export type E164Phone = Branded<string, 'E164Phone'>;

/** Score between 0 and 100. */
export type Score = Branded<number, 'Score'>;
export const Score = (n: number): Score => {
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new RangeError(`Score must be in [0, 100], received: ${String(n)}`);
  }
  return n as Score;
};

import type { IsoTimestamp, OperatorId, ZipCode } from './branded.js';

export type {
  AutomationId,
  BuyerId,
  CorrelationId,
  E164Phone,
  InteractionId,
  IsoTimestamp,
  LeadId,
  OperatorId,
  ProbateCaseId,
  ScoreHistoryId,
  UsStateCode,
} from './branded.js';

/**
 * US ZIP code — alias kept for backwards-compatible naming across the codebase.
 * Prefer `ZipCode` (from `./branded.js`) in new code.
 */
export type UsZipCode = ZipCode;

/** Base entity — every persisted document extends this. */
export interface BaseEntity {
  readonly id: string;
  readonly operatorId: OperatorId;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/** Every operator-scoped domain entity carries the owning operator's ID. */
export interface OperatorScoped {
  readonly operatorId: OperatorId;
}

/** Standard created/updated audit timestamps shared by all persisted entities. */
export interface AuditFields {
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/** US mailing address. */
export interface Address {
  readonly street: string;
  readonly unit?: string;
  readonly city: string;
  readonly state: string;
  readonly zip: string;
  readonly county?: string;
}

/** Full name components. */
export interface PersonName {
  readonly first: string;
  readonly last: string;
  readonly middle?: string;
  readonly suffix?: string;
}

/** Contact channels. */
export interface Contact {
  readonly email?: string;
  readonly phone?: string;
  readonly phoneAlt?: string;
}

/** Money amount in cents (avoids floating-point drift). */
export type Cents = number;

export const toCents = (dollars: number): Cents => Math.round(dollars * 100);
export const toDollars = (cents: Cents): number => cents / 100;

/** Discriminated result — replaces try/catch for expected failures. */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Prettify utility — flattens intersection types for cleaner IDE tooltips. */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Deep readonly — recursively marks all properties immutable. */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

/** Non-empty array — guarantees at least one element at the type level. */
export type NonEmptyArray<T> = readonly [T, ...T[]];

/** Utility for creating input types (omits server-generated fields). */
export type CreateInput<T extends BaseEntity> = Omit<
  T,
  'id' | 'operatorId' | 'createdAt' | 'updatedAt'
>;

/** Utility for creating update types (all fields optional, no immutables). */
export type UpdateInput<T extends BaseEntity> = Partial<
  Omit<T, 'id' | 'operatorId' | 'createdAt'>
>;

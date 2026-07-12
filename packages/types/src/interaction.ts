import type {
  AuditFields,
  InteractionId,
  IsoTimestamp,
  LeadId,
  OperatorScoped,
} from './common.js';

/**
 * Interactions are the ML feedback loop. Every meaningful operator action
 * creates an interaction record which is later used to retrain the scoring model.
 *
 * Append-only: never mutated after creation.
 */

export const InteractionType = {
  // Communication
  EMAIL_SENT: 'email_sent',
  EMAIL_OPENED: 'email_opened',
  EMAIL_REPLIED: 'email_replied',
  CALL_MADE: 'call_made',
  CALL_ANSWERED: 'call_answered',
  VOICEMAIL_LEFT: 'voicemail_left',

  // Operator actions
  STATUS_CHANGED: 'status_changed',
  MOTIVATION_UPDATED: 'motivation_updated',
  NOTE_ADDED: 'note_added',
  TAG_ADDED: 'tag_added',
  APPOINTMENT_SET: 'appointment_set',
  OFFER_MADE: 'offer_made',
  OFFER_ACCEPTED: 'offer_accepted',
  OFFER_REJECTED: 'offer_rejected',
  CONTRACT_SIGNED: 'contract_signed',
  DEAL_CLOSED: 'deal_closed',
  DEAL_LOST: 'deal_lost',

  // System events (used for scoring)
  SCORED: 'scored',
  ASSIGNED: 'assigned',
} as const;
export type InteractionType = (typeof InteractionType)[keyof typeof InteractionType];

export const InteractionOutcome = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
} as const;
export type InteractionOutcome = (typeof InteractionOutcome)[keyof typeof InteractionOutcome];

export interface Interaction extends OperatorScoped, AuditFields {
  readonly id: InteractionId;
  readonly leadId: LeadId;
  readonly type: InteractionType;
  readonly outcome: InteractionOutcome;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: IsoTimestamp;
  readonly durationSeconds?: number;
  readonly channelId?: string;                 // SendGrid message ID, etc.
}

export type CreateInteractionInput = Omit<
  Interaction,
  'id' | 'operatorId' | 'createdAt' | 'updatedAt'
>;

/**
 * Feature vector extracted from interaction history for ML training.
 * Aggregated per-lead by the scoring engine.
 */
export interface InteractionFeatures {
  readonly totalInteractions: number;
  readonly positiveCount: number;
  readonly negativeCount: number;
  readonly responseRate: number;               // replies / messages sent
  readonly avgResponseTimeMinutes: number;
  readonly daysSinceFirstContact: number;
  readonly daysSinceLastContact: number;
  readonly hasAppointment: boolean;
  readonly hasOffer: boolean;
  readonly hasContract: boolean;
}

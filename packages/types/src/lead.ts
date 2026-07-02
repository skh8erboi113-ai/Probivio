import type {
  AuditFields,
  Cents,
  E164Phone,
  IsoTimestamp,
  LeadId,
  OperatorId,
  OperatorScoped,
  UsStateCode,
  UsZipCode,
} from './common.js';

// ─── Enums as const objects (better than TS enums) ────────────────────────
export const LeadStatus = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  UNDER_CONTRACT: 'under_contract',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost',
  DEAD: 'dead',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const LeadSource = {
  PROBATE: 'probate',
  DIRECT_MAIL: 'direct_mail',
  COLD_CALL: 'cold_call',
  REFERRAL: 'referral',
  DRIVING_FOR_DOLLARS: 'driving_for_dollars',
  WEB_FORM: 'web_form',
  PPC: 'ppc',
  BANDIT_SIGN: 'bandit_sign',
  OTHER: 'other',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const MotivationLevel = {
  UNKNOWN: 'unknown',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;
export type MotivationLevel = (typeof MotivationLevel)[keyof typeof MotivationLevel];

export const PropertyCondition = {
  UNKNOWN: 'unknown',
  TURNKEY: 'turnkey',
  LIGHT_REHAB: 'light_rehab',
  MEDIUM_REHAB: 'medium_rehab',
  HEAVY_REHAB: 'heavy_rehab',
  TEARDOWN: 'teardown',
} as const;
export type PropertyCondition = (typeof PropertyCondition)[keyof typeof PropertyCondition];

// ─── Sub-interfaces ───────────────────────────────────────────────────────
export interface PropertyDetails {
  readonly address: string;
  readonly city: string;
  readonly state: UsStateCode;
  readonly zip: UsZipCode;
  readonly county?: string;
  readonly beds?: number;
  readonly baths?: number;
  readonly sqft?: number;
  readonly yearBuilt?: number;
  readonly lotSize?: number;
  readonly propertyType?: string;
  readonly condition?: PropertyCondition;
}

export interface DealMetrics {
  readonly estimatedValue?: Cents;
  readonly askingPrice?: Cents;
  readonly arv?: Cents;              // After Repair Value
  readonly repairEstimate?: Cents;
  readonly assignmentFee?: Cents;
  readonly maxOffer?: Cents;
}

export interface ContactInfo {
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
  readonly phone?: E164Phone;
  readonly alternatePhone?: E164Phone;
}

// ─── Root Lead entity ─────────────────────────────────────────────────────
export interface Lead extends OperatorScoped, AuditFields {
  readonly id: LeadId;
  readonly contact: ContactInfo;
  readonly property: PropertyDetails;
  readonly metrics: DealMetrics;
  readonly source: LeadSource;
  readonly status: LeadStatus;
  readonly motivation: MotivationLevel;
  readonly score?: number;                     // 0-100, set by scoring engine
  readonly scoreConfidence?: number;           // 0-1
  readonly scoreExplanation?: string;          // Gemini-generated
  readonly scoredAt?: IsoTimestamp;
  readonly notes?: string;
  readonly tags: readonly string[];
  readonly assignedTo?: OperatorId;
  readonly lastContactedAt?: IsoTimestamp;
  readonly nextFollowUpAt?: IsoTimestamp;
  readonly probateCaseId?: string;             // If sourced from probate scanner
}

// ─── Input types (what clients send) ──────────────────────────────────────
export type CreateLeadInput = Omit<
  Lead,
  'id' | 'operatorId' | 'score' | 'scoreConfidence' | 'scoreExplanation' | 'scoredAt' | 'createdAt' | 'updatedAt' | 'tags'
> & {
  readonly tags?: readonly string[];
};

export type UpdateLeadInput = Partial<
  Omit<Lead, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>
>;

// ─── Query filters ────────────────────────────────────────────────────────
export interface LeadFilters {
  readonly status?: LeadStatus;
  readonly source?: LeadSource;
  readonly motivation?: MotivationLevel;
  readonly minScore?: number;
  readonly maxScore?: number;
  readonly assignedTo?: OperatorId;
  readonly search?: string;
  readonly tags?: readonly string[];
}

export type LeadSortField = 'createdAt' | 'updatedAt' | 'score' | 'lastContactedAt' | 'nextFollowUpAt';

import type {
  AuditFields,
  IsoTimestamp,
  LeadId,
  OperatorScoped,
  ProbateCaseId,
  UsStateCode,
} from './common.js';

export const ProbateStatus = {
  FILED: 'filed',
  PENDING: 'pending',
  IN_ADMINISTRATION: 'in_administration',
  CLOSED: 'closed',
  UNKNOWN: 'unknown',
} as const;
export type ProbateStatus = (typeof ProbateStatus)[keyof typeof ProbateStatus];

export interface Decedent {
  readonly fullName: string;
  readonly dateOfDeath?: IsoTimestamp;
  readonly lastKnownAddress?: string;
  readonly age?: number;
}

export interface Executor {
  readonly fullName: string;
  readonly relationship?: string;
  readonly address?: string;
  readonly phone?: string;
  readonly email?: string;
}

export interface EstateAsset {
  readonly type: 'real_property' | 'vehicle' | 'financial' | 'other';
  readonly description: string;
  readonly estimatedValue?: number;
  readonly address?: string;
}

export interface ProbateCase extends OperatorScoped, AuditFields {
  readonly id: ProbateCaseId;
  readonly caseNumber: string;
  readonly county: string;
  readonly state: UsStateCode;
  readonly courtName: string;
  readonly filedAt: IsoTimestamp;
  readonly status: ProbateStatus;
  readonly decedent: Decedent;
  readonly executors: readonly Executor[];
  readonly assets: readonly EstateAsset[];
  readonly estimatedEstateValue?: number;
  readonly sourceDocumentUrl?: string;         // S3 URL of scanned PDF
  readonly extractionConfidence: number;       // 0-1 from Gemini OCR
  readonly rawExtractedText?: string;
  readonly convertedToLeadId?: LeadId;         // If operator converted to a lead
  readonly reviewedAt?: IsoTimestamp;
}

export type CreateProbateCaseInput = Omit<
  ProbateCase,
  'id' | 'operatorId' | 'createdAt' | 'updatedAt' | 'convertedToLeadId' | 'reviewedAt'
>;

export type UpdateProbateCaseInput = Partial<
  Omit<ProbateCase, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>
>;

// ─── Gemini extraction result ─────────────────────────────────────────────
export interface ProbateExtractionResult {
  readonly caseNumber: string | null;
  readonly county: string | null;
  readonly state: string | null;
  readonly filedDate: string | null;
  readonly decedent: Partial<Decedent>;
  readonly executors: readonly Partial<Executor>[];
  readonly assets: readonly Partial<EstateAsset>[];
  readonly confidence: number;
  readonly warnings: readonly string[];
}

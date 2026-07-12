import type {
  AuditFields,
  IsoTimestamp,
  LeadId,
  OperatorId,
  ScoreHistoryId,
} from './common.js';

/**
 * The scoring engine outputs three dimensions plus a composite.
 * Each dimension has independent feature inputs and can be tuned separately.
 */

export interface ScoreDimensions {
  /** Financial upside — margin, ARV vs asking, repair ratio */
  readonly dealScore: number;                  // 0-100

  /** Seller motivation — response speed, keywords, urgency signals */
  readonly motivationScore: number;            // 0-100

  /** Timing/urgency — probate age, days on market, follow-up gaps */
  readonly urgencyScore: number;               // 0-100
}

export interface ScoreResult extends ScoreDimensions {
  /** Weighted composite (0-100) */
  readonly composite: number;

  /** Model confidence in the result */
  readonly confidence: number;                  // 0-1

  /** Human-readable explanation from Gemini */
  readonly explanation: string;

  /** Recommended next action */
  readonly recommendation: ScoreRecommendation;

  /** Which features drove the score (for interpretability) */
  readonly topFactors: readonly ScoreFactor[];

  /** Version of the scoring model that produced this */
  readonly modelVersion: string;

  /** When the score was computed */
  readonly scoredAt: IsoTimestamp;
}

export const ScoreRecommendation = {
  PURSUE_AGGRESSIVELY: 'pursue_aggressively',
  PURSUE: 'pursue',
  MONITOR: 'monitor',
  DEPRIORITIZE: 'deprioritize',
  PASS: 'pass',
} as const;
export type ScoreRecommendation = (typeof ScoreRecommendation)[keyof typeof ScoreRecommendation];

export interface ScoreFactor {
  readonly name: string;
  readonly value: number;                       // -1 to 1 (negative = penalizing)
  readonly weight: number;                      // 0-1
  readonly description: string;
}

/**
 * Persisted score history — enables auditing "why was this lead scored X 6 months ago?"
 * and provides training data for model retraining.
 */
export interface ScoreHistory extends AuditFields {
  readonly id: ScoreHistoryId;
  readonly leadId: LeadId;
  readonly operatorId: OperatorId;
  readonly score: ScoreResult;
  readonly triggeredBy: 'creation' | 'update' | 'manual' | 'retrain' | 'interaction';
  readonly previousComposite?: number;
}

/**
 * Weights used to combine dimension scores into composite.
 * These are the values the model retraining loop updates.
 */
export interface ScoringWeights {
  readonly dealWeight: number;                  // 0-1
  readonly motivationWeight: number;            // 0-1
  readonly urgencyWeight: number;               // 0-1
  readonly version: string;
  readonly trainedAt: IsoTimestamp;
  readonly trainingSampleSize: number;
  readonly validationAccuracy: number;          // 0-1
}

/** One dimension's weight at two points in time, for a drift comparison. */
export interface WeightDriftEntry {
  readonly dimension: 'deal' | 'motivation' | 'urgency';
  readonly currentWeight: number;
  readonly previousWeight: number;
  /** currentWeight - previousWeight, as a fraction (e.g. 0.12 = "12 points more"). */
  readonly delta: number;
}

/**
 * Full "why this score" drill-down for a single lead: the per-dimension
 * factor contributions from the score itself, plus how the model's weights
 * have drifted since `comparedAgainst` (the retraining run active as of the
 * lookback window) — e.g. "urgency now matters 12% more than 30 days ago".
 * `driftAvailable` is false when there isn't an older weight snapshot to
 * compare against yet (new operator, or fewer than two retraining runs).
 */
export interface ScoreDrillDown {
  readonly score: ScoreResult;
  readonly currentWeights: ScoringWeights;
  readonly driftAvailable: boolean;
  readonly comparedAgainst?: IsoTimestamp;
  readonly weightDrift: readonly WeightDriftEntry[];
}

/**
 * Append-only log of every weight set the retraining loop has ever produced
 * for an operator. `ScoringWeightsRepository.getCurrent` only exposes the
 * latest row; this history is what powers the "how has the model drifted"
 * view on the lead detail page — e.g. "urgency now matters 12% more than
 * 30 days ago" — by comparing the current weights against whatever was
 * active as of a given lookback window.
 */
export interface ScoringWeightsHistoryEntry extends AuditFields {
  readonly id: string;
  readonly operatorId: OperatorId;
  readonly weights: ScoringWeights;
}

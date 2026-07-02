import type {
  InteractionFeatures,
  Lead,
  ScoreHistory,
} from '@listinglogic/types';
import { PropertyCondition, MotivationLevel } from '@listinglogic/types';

/**
 * Feature extractor — mirror of services/ml-trainer/ml_trainer/features.py
 *
 * Must produce IDENTICAL vectors to the Python trainer or the model breaks.
 * The FEATURE_NAMES array order below MUST match the Python one exactly.
 */

export const FEATURE_NAMES = [
  'deal_asking_price_log',
  'deal_arv_log',
  'deal_repair_estimate_log',
  'deal_assignment_fee_log',
  'deal_max_offer_log',
  'deal_equity_ratio',
  'deal_repair_ratio',
  'deal_satisfies_70_rule',
  'deal_has_arv',
  'deal_has_repair_estimate',
  'deal_has_asking_price',
  'prop_beds',
  'prop_baths',
  'prop_sqft_log',
  'prop_year_built',
  'prop_lot_size_log',
  'prop_condition_ordinal',
  'source_probate',
  'source_direct_mail',
  'source_cold_call',
  'source_referral',
  'source_driving',
  'source_web',
  'motivation_ordinal',
  'int_total_count',
  'int_positive_count',
  'int_negative_count',
  'int_response_rate',
  'int_avg_response_time_minutes',
  'int_days_since_first_contact',
  'int_days_since_last_contact',
  'int_has_appointment',
  'int_has_offer',
  'int_has_contract',
  'temporal_lead_age_days',
  'temporal_hour_of_day',
  'temporal_day_of_week',
  'prior_deal_score',
  'prior_motivation_score',
  'prior_urgency_score',
  'prior_composite_score',
] as const;

const CONDITION_ORDINAL: Record<string, number> = {
  [PropertyCondition.UNKNOWN]: 0,
  [PropertyCondition.TURNKEY]: 1,
  [PropertyCondition.LIGHT_REHAB]: 2,
  [PropertyCondition.MEDIUM_REHAB]: 3,
  [PropertyCondition.HEAVY_REHAB]: 4,
  [PropertyCondition.TEARDOWN]: 5,
};

const MOTIVATION_ORDINAL: Record<string, number> = {
  [MotivationLevel.UNKNOWN]: 0,
  [MotivationLevel.LOW]: 1,
  [MotivationLevel.MEDIUM]: 2,
  [MotivationLevel.HIGH]: 3,
  [MotivationLevel.URGENT]: 4,
};

function safeLog(value: number | null | undefined): number {
  if (value === null || value === undefined || value <= 0) return 0;
  return Math.log1p(value);
}

export interface FeatureExtractorInput {
  readonly lead: Lead;
  readonly interactionFeatures: InteractionFeatures;
  readonly priorScoreHistory: ScoreHistory | null;
}

export class MlFeatureExtractorService {
  public extract(input: FeatureExtractorInput): Float32Array {
    const { lead, interactionFeatures, priorScoreHistory } = input;
    const { metrics, property, source, motivation, createdAt } = lead;

    // Deal features
    const asking = metrics.askingPrice ?? null;
    const arv = metrics.arv ?? null;
    const repair = metrics.repairEstimate ?? null;

    let equityRatio = 0;
    if (arv && repair !== null && asking) {
      equityRatio = Math.max(0, Math.min(1, (arv - repair - asking) / arv));
    }

    let repairRatio = 0;
    if (arv && repair !== null && arv > 0) {
      repairRatio = Math.min(1, repair / arv);
    }

    let satisfies70 = 0;
    if (arv && repair !== null && metrics.maxOffer) {
      const target = arv * 0.7 - repair;
      satisfies70 = metrics.maxOffer <= target ? 1 : 0;
    }

    // Temporal
    let leadAgeDays = 0;
    let hourOfDay = 0;
    let dayOfWeek = 0;
    try {
      const dt = new Date(createdAt);
      leadAgeDays = Math.floor((Date.now() - dt.getTime()) / (24 * 60 * 60 * 1000));
      hourOfDay = dt.getUTCHours();
      dayOfWeek = dt.getUTCDay() === 0 ? 6 : dt.getUTCDay() - 1;
    } catch {
      /* keep zeros */
    }

    // Prior scores
    const prior = priorScoreHistory?.score;
    const priorDeal = prior?.dealScore ?? 50;
    const priorMotivation = prior?.motivationScore ?? 50;
    const priorUrgency = prior?.urgencyScore ?? 50;
    const priorComposite = prior?.composite ?? 50;

    const vec = new Float32Array(FEATURE_NAMES.length);
    let i = 0;

    vec[i++] = safeLog(asking);
    vec[i++] = safeLog(arv);
    vec[i++] = safeLog(repair);
    vec[i++] = safeLog(metrics.assignmentFee ?? null);
    vec[i++] = safeLog(metrics.maxOffer ?? null);
    vec[i++] = equityRatio;
    vec[i++] = repairRatio;
    vec[i++] = satisfies70;
    vec[i++] = arv ? 1 : 0;
    vec[i++] = repair !== null && repair !== undefined ? 1 : 0;
    vec[i++] = asking ? 1 : 0;
    vec[i++] = property.beds ?? 0;
    vec[i++] = property.baths ?? 0;
    vec[i++] = safeLog(property.sqft ?? null);
    vec[i++] = property.yearBuilt ?? 0;
    vec[i++] = safeLog(property.lotSize ?? null);
    vec[i++] = CONDITION_ORDINAL[property.condition ?? PropertyCondition.UNKNOWN] ?? 0;
    vec[i++] = source === 'probate' ? 1 : 0;
    vec[i++] = source === 'direct_mail' ? 1 : 0;
    vec[i++] = source === 'cold_call' ? 1 : 0;
    vec[i++] = source === 'referral' ? 1 : 0;
    vec[i++] = source === 'driving_for_dollars' ? 1 : 0;
    vec[i++] = source === 'web_form' ? 1 : 0;
    vec[i++] = MOTIVATION_ORDINAL[motivation] ?? 0;
    vec[i++] = interactionFeatures.totalInteractions;
    vec[i++] = interactionFeatures.positiveCount;
    vec[i++] = interactionFeatures.negativeCount;
    vec[i++] = interactionFeatures.responseRate;
    vec[i++] = interactionFeatures.avgResponseTimeMinutes;
    vec[i++] = interactionFeatures.daysSinceFirstContact;
    vec[i++] = interactionFeatures.daysSinceLastContact;
    vec[i++] = interactionFeatures.hasAppointment ? 1 : 0;
    vec[i++] = interactionFeatures.hasOffer ? 1 : 0;
    vec[i++] = interactionFeatures.hasContract ? 1 : 0;
    vec[i++] = leadAgeDays;
    vec[i++] = hourOfDay;
    vec[i++] = dayOfWeek;
    vec[i++] = priorDeal;
    vec[i++] = priorMotivation;
    vec[i++] = priorUrgency;
    vec[i++] = priorComposite;

    return vec;
  }
}

export function createMlFeatureExtractorService(): MlFeatureExtractorService {
  return new MlFeatureExtractorService();
  }

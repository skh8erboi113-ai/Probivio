import type { Logger } from '@listinglogic/logger';
import type {
  InteractionRepository,
  LeadRepository,
  ScoreHistoryRepository,
  ScoringWeightsRepository,
} from '@listinglogic/db';
import type {
  InteractionFeatures,
  IsoTimestamp,
  Lead,
  LeadId,
  OperatorId,
  ScoreFactor,
  ScoreHistory,
  ScoreResult,
  ScoringWeights,
} from '@listinglogic/types';
import {
  LeadSource,
  MotivationLevel,
  PropertyCondition,
  ScoreRecommendation,
} from '@listinglogic/types';

import type { GeminiService } from './gemini.service.js';

/**
 * Scoring engine — the core intellectual property.
 *
 * Produces THREE independent dimension scores plus a composite:
 *
 *   1. Deal Score      — financial upside (margin, ARV/asking ratio, repair ratio)
 *   2. Motivation Score — seller signals (source, condition, response patterns)
 *   3. Urgency Score   — timing pressure (days on market, follow-up gaps, contract signals)
 *
 * The composite uses per-operator weights that the RETRAINING LOOP updates
 * based on which leads actually closed vs which were dead ends.
 *
 * This is deterministic + explainable (no ML black box for the score itself).
 * Gemini is used only for the natural-language explanation of WHY.
 */

const MODEL_VERSION = '2.0.0-heuristic';

export class ScoringService {
  private readonly logger: Logger;

  constructor(
    private readonly leadRepo: LeadRepository,
    private readonly interactionRepo: InteractionRepository,
    private readonly scoreHistoryRepo: ScoreHistoryRepository,
    private readonly weightsRepo: ScoringWeightsRepository,
    private readonly gemini: GeminiService,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'scoring' });
  }

  /**
   * Score a lead and persist the result + history.
   */
  public async scoreLead(
    operatorId: OperatorId,
    leadId: LeadId,
    triggeredBy: ScoreHistory['triggeredBy'] = 'manual',
  ): Promise<ScoreResult> {
    const start = Date.now();

    const lead = await this.leadRepo.findByIdOrThrow(operatorId, leadId);
    const features = await this.interactionRepo.computeFeatures(operatorId, leadId);
    const weights = await this.weightsRepo.getCurrent(operatorId);

    const dealScore = this.computeDealScore(lead);
    const motivationScore = this.computeMotivationScore(lead, features);
    const urgencyScore = this.computeUrgencyScore(lead, features);
    const composite = this.combine(dealScore.score, motivationScore.score, urgencyScore.score, weights);
    const confidence = this.computeConfidence(lead, features);
    const topFactors = this.selectTopFactors([
      ...dealScore.factors,
      ...motivationScore.factors,
      ...urgencyScore.factors,
    ]);

    const explanation = await this.gemini.explainScore({
      dealScore: dealScore.score,
      motivationScore: motivationScore.score,
      urgencyScore: urgencyScore.score,
      composite,
      leadSummary: this.summarizeLead(lead),
    });

    const result: ScoreResult = {
      dealScore: dealScore.score,
      motivationScore: motivationScore.score,
      urgencyScore: urgencyScore.score,
      composite,
      confidence,
      explanation,
      recommendation: this.recommendationFor(composite, confidence),
      topFactors,
      modelVersion: MODEL_VERSION,
      scoredAt: new Date().toISOString() as IsoTimestamp,
    };

    const previousComposite = lead.score;
    await Promise.all([
      this.leadRepo.applyScore(operatorId, leadId, result),
      this.scoreHistoryRepo.record(operatorId, leadId, result, triggeredBy, previousComposite),
    ]);

    this.logger.info('Lead scored', {
      leadId,
      composite,
      confidence,
      durationMs: Date.now() - start,
    });

    return result;
  }

  // ─── Deal dimension ─────────────────────────────────────────────────────
  private computeDealScore(lead: Lead): { readonly score: number; readonly factors: ScoreFactor[] } {
    const factors: ScoreFactor[] = [];
    const { metrics } = lead;

    let raw = 40;   // baseline

    // Assignment margin (arv - repairs - offer) / arv
    if (metrics.arv && metrics.repairEstimate !== undefined && metrics.askingPrice) {
      const netEquity = metrics.arv - metrics.repairEstimate - metrics.askingPrice;
      const equityRatio = netEquity / metrics.arv;

      if (equityRatio > 0.3) {
        raw += 40;
        factors.push({
          name: 'strong_equity',
          value: 0.9,
          weight: 0.4,
          description: `${Math.round(equityRatio * 100)}% equity spread after repairs`,
        });
      } else if (equityRatio > 0.15) {
        raw += 20;
        factors.push({
          name: 'moderate_equity',
          value: 0.5,
          weight: 0.3,
          description: `${Math.round(equityRatio * 100)}% equity spread`,
        });
      } else if (equityRatio > 0) {
        raw += 5;
      } else {
        raw -= 15;
        factors.push({
          name: 'underwater',
          value: -0.8,
          weight: 0.4,
          description: 'Asking price exceeds ARV minus repairs',
        });
      }
    }

    // 70% rule check
    if (metrics.arv && metrics.repairEstimate !== undefined && metrics.maxOffer) {
      const seventyRuleTarget = metrics.arv * 0.7 - metrics.repairEstimate;
      if (metrics.maxOffer <= seventyRuleTarget) {
        raw += 15;
        factors.push({
          name: 'satisfies_70_rule',
          value: 0.7,
          weight: 0.3,
          description: 'Max offer within 70% rule',
        });
      }
    }

    // Assignment fee sanity
    if (metrics.assignmentFee !== undefined) {
      if (metrics.assignmentFee >= 500_000) {
        raw += 10;
      } else if (metrics.assignmentFee < 100_000) {
        raw -= 5;
      }
    }

    return { score: this.clamp(raw), factors };
  }

  // ─── Motivation dimension ───────────────────────────────────────────────
  private computeMotivationScore(
    lead: Lead,
    features: InteractionFeatures,
  ): { readonly score: number; readonly factors: ScoreFactor[] } {
    const factors: ScoreFactor[] = [];
    let raw = 30;

    switch (lead.motivation) {
      case MotivationLevel.URGENT:
        raw += 50;
        factors.push({ name: 'urgent_motivation', value: 1, weight: 0.5, description: 'Operator flagged as urgent' });
        break;
      case MotivationLevel.HIGH:
        raw += 35;
        factors.push({ name: 'high_motivation', value: 0.8, weight: 0.4, description: 'High motivation flag' });
        break;
      case MotivationLevel.MEDIUM:
        raw += 15;
        break;
      case MotivationLevel.LOW:
        raw -= 10;
        break;
      default:
        break;
    }

    // Source signals
    if (lead.source === LeadSource.PROBATE) {
      raw += 15;
      factors.push({ name: 'probate_source', value: 0.7, weight: 0.3, description: 'Probate leads convert 2-3x baseline' });
    }
    if (lead.source === LeadSource.REFERRAL) {
      raw += 10;
    }

    // Condition
    if (lead.property.condition === PropertyCondition.HEAVY_REHAB || lead.property.condition === PropertyCondition.TEARDOWN) {
      raw += 10;
      factors.push({ name: 'distressed_property', value: 0.6, weight: 0.2, description: 'Distressed condition' });
    }

    // Response signals from interactions
    if (features.hasAppointment) {
      raw += 15;
      factors.push({ name: 'appointment_set', value: 0.9, weight: 0.4, description: 'Appointment scheduled' });
    }
    if (features.responseRate > 0.5) {
      raw += 10;
      factors.push({ name: 'high_response_rate', value: 0.7, weight: 0.3, description: `${Math.round(features.responseRate * 100)}% response rate` });
    }
    if (features.avgResponseTimeMinutes > 0 && features.avgResponseTimeMinutes < 60) {
      raw += 8;
    }
    if (features.negativeCount > features.positiveCount * 2) {
      raw -= 15;
      factors.push({ name: 'negative_interactions', value: -0.6, weight: 0.3, description: 'Repeated negative interactions' });
    }

    return { score: this.clamp(raw), factors };
  }

  // ─── Urgency dimension ──────────────────────────────────────────────────
  private computeUrgencyScore(
    lead: Lead,
    features: InteractionFeatures,
  ): { readonly score: number; readonly factors: ScoreFactor[] } {
    const factors: ScoreFactor[] = [];
    let raw = 40;

    // Contract / offer momentum
    if (features.hasContract) {
      raw += 40;
      factors.push({ name: 'contract_signed', value: 1, weight: 0.5, description: 'Contract signed' });
    } else if (features.hasOffer) {
      raw += 25;
      factors.push({ name: 'offer_made', value: 0.8, weight: 0.4, description: 'Offer already made' });
    }

    // Freshness
    if (features.daysSinceLastContact === 0) {
      raw += 10;
    } else if (features.daysSinceLastContact > 14) {
      raw -= 15;
      factors.push({
        name: 'stale_lead',
        value: -0.6,
        weight: 0.3,
        description: `${features.daysSinceLastContact} days since last contact`,
      });
    } else if (features.daysSinceLastContact > 30) {
      raw -= 30;
    }

    // Follow-up scheduled soon
    if (lead.nextFollowUpAt) {
      const nextMs = new Date(lead.nextFollowUpAt).getTime() - Date.now();
      const nextDays = nextMs / (24 * 60 * 60 * 1000);
      if (nextDays >= 0 && nextDays <= 2) {
        raw += 10;
        factors.push({ name: 'imminent_followup', value: 0.6, weight: 0.2, description: 'Follow-up due within 48 hours' });
      }
    }

    return { score: this.clamp(raw), factors };
  }

  // ─── Composition ────────────────────────────────────────────────────────
  private combine(deal: number, motivation: number, urgency: number, weights: ScoringWeights): number {
    const total = weights.dealWeight + weights.motivationWeight + weights.urgencyWeight;
    if (total === 0) return Math.round((deal + motivation + urgency) / 3);

    const composite =
      (deal * weights.dealWeight + motivation * weights.motivationWeight + urgency * weights.urgencyWeight) /
      total;

    return Math.round(this.clamp(composite));
  }

  private computeConfidence(lead: Lead, features: InteractionFeatures): number {
    let signals = 0;
    if (lead.metrics.arv) signals++;
    if (lead.metrics.repairEstimate !== undefined) signals++;
    if (lead.metrics.askingPrice) signals++;
    if (lead.property.condition && lead.property.condition !== PropertyCondition.UNKNOWN) signals++;
    if (lead.motivation !== MotivationLevel.UNKNOWN) signals++;
    if (features.totalInteractions > 3) signals++;
    if (features.totalInteractions > 10) signals++;

    return Math.min(1, signals / 7);
  }

  private recommendationFor(composite: number, confidence: number): ScoreRecommendation {
    if (composite >= 80 && confidence >= 0.6) return ScoreRecommendation.PURSUE_AGGRESSIVELY;
    if (composite >= 60) return ScoreRecommendation.PURSUE;
    if (composite >= 40) return ScoreRecommendation.MONITOR;
    if (composite >= 25) return ScoreRecommendation.DEPRIORITIZE;
    return ScoreRecommendation.PASS;
  }

  private selectTopFactors(factors: readonly ScoreFactor[]): readonly ScoreFactor[] {
    return [...factors]
      .sort((a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight))
      .slice(0, 5);
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }

  private summarizeLead(lead: Lead): string {
    const parts: string[] = [];
    parts.push(`Property: ${lead.property.address}, ${lead.property.city} ${lead.property.state}`);
    if (lead.property.beds || lead.property.sqft) {
      parts.push(`${lead.property.beds ?? '?'}bd, ${lead.property.sqft ?? '?'}sqft`);
    }
    parts.push(`Source: ${lead.source}, Status: ${lead.status}, Motivation: ${lead.motivation}`);
    if (lead.metrics.arv) parts.push(`ARV: $${(lead.metrics.arv / 100).toLocaleString()}`);
    if (lead.metrics.askingPrice) parts.push(`Asking: $${(lead.metrics.askingPrice / 100).toLocaleString()}`);
    if (lead.metrics.repairEstimate !== undefined) parts.push(`Repairs: $${(lead.metrics.repairEstimate / 100).toLocaleString()}`);
    return parts.join(' | ');
  }
}

export function createScoringService(deps: {
  readonly leadRepo: LeadRepository;
  readonly interactionRepo: InteractionRepository;
  readonly scoreHistoryRepo: ScoreHistoryRepository;
  readonly weightsRepo: ScoringWeightsRepository;
  readonly gemini: GeminiService;
  readonly logger: Logger;
}): ScoringService {
  return new ScoringService(
    deps.leadRepo,
    deps.interactionRepo,
    deps.scoreHistoryRepo,
    deps.weightsRepo,
    deps.gemini,
    deps.logger,
  );
}

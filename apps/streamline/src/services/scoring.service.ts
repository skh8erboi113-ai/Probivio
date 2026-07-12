import {
  LeadSource,
  MotivationLevel,
  PropertyCondition,
  ScoreRecommendation,
} from '@probivio/types';


import type { BuyerNotificationService } from './buyer-notification.service.js';
import type { GeminiService } from './gemini.service.js';
import type { MlFeatureExtractorService } from './ml-feature-extractor.service.js';
import type { ModelRegistryService } from './model-registry.service.js';
import type { OnnxInferenceService } from './onnx-inference.service.js';
import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import type {
  InteractionRepository,
  LeadRepository,
  ScoreHistoryRepository,
  ScoringWeightsRepository,
} from '@probivio/db';
import type { Logger } from '@probivio/logger';
import type {
  IsoTimestamp,
  InteractionFeatures,
  Lead,
  LeadId,
  OperatorId,
  ScoreDrillDown,
  ScoreFactor,
  ScoreHistory,
  ScoreResult,
} from '@probivio/types';

const HEURISTIC_MODEL_VERSION = '2.0.0-heuristic-fallback';

export class ScoringService {
  private readonly logger: Logger;

  constructor(
    private readonly leadRepo: LeadRepository,
    private readonly interactionRepo: InteractionRepository,
    private readonly scoreHistoryRepo: ScoreHistoryRepository,
    private readonly weightsRepo: ScoringWeightsRepository,
    private readonly gemini: GeminiService,
    private readonly modelRegistry: ModelRegistryService,
    private readonly inference: OnnxInferenceService,
    private readonly featureExtractor: MlFeatureExtractorService,
    private readonly eventPublisher: EventPublisherService,
    private readonly buyerNotification: BuyerNotificationService,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'scoring' });
  }

  public async scoreLead(
    operatorId: OperatorId,
    leadId: LeadId,
    triggeredBy: ScoreHistory['triggeredBy'] = 'manual',
  ): Promise<ScoreResult> {
    const start = Date.now();

    const lead = await this.leadRepo.findByIdOrThrow(operatorId, leadId);
    const interactionFeatures = await this.interactionRepo.computeFeatures(operatorId, leadId);

    const dealScore = this.computeDealScore(lead);
    const motivationScore = this.computeMotivationScore(lead, interactionFeatures);
    const urgencyScore = this.computeUrgencyScore(lead, interactionFeatures);

    let composite: number;
    let confidence: number;
    let modelVersion: string;
    let mlProbability: number | null = null;

    const model = await this.modelRegistry.getModel(operatorId);

    if (model) {
      try {
        const priorHistory = await this.scoreHistoryRepo.findByLead(operatorId, leadId, 1);
        const priorEntry = priorHistory[0] ?? null;

        const features = this.featureExtractor.extract({
          lead,
          interactionFeatures,
          priorScoreHistory: priorEntry,
        });

        mlProbability = await this.inference.predict(operatorId, model, features);

        composite = Math.round(mlProbability * 100);
        confidence = Math.min(0.99, 0.5 + model.metadata.auc * 0.5);
        modelVersion = model.metadata.version;
      } catch (err) {
        this.logger.warn('ML inference failed, falling back to heuristic', {
          leadId,
          error: err instanceof Error ? err.message : String(err),
        });
        composite = await this.computeWeightedComposite(operatorId, dealScore.score, motivationScore.score, urgencyScore.score);
        confidence = this.computeHeuristicConfidence(lead, interactionFeatures);
        modelVersion = HEURISTIC_MODEL_VERSION;
      }
    } else {
      composite = await this.computeWeightedComposite(operatorId, dealScore.score, motivationScore.score, urgencyScore.score);
      confidence = this.computeHeuristicConfidence(lead, interactionFeatures);
      modelVersion = HEURISTIC_MODEL_VERSION;
    }

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
      modelVersion,
      scoredAt: new Date().toISOString() as IsoTimestamp,
    };

    const previousComposite = lead.score;
    const [updatedLead] = await Promise.all([
      this.leadRepo.applyScore(operatorId, leadId, result),
      this.scoreHistoryRepo.record(operatorId, leadId, result, triggeredBy, previousComposite),
    ]);

    // Real-time broadcast
    this.eventPublisher.publish('lead.scored', operatorId, {
      leadId,
      composite,
      confidence,
      recommendation: result.recommendation,
      modelVersion,
    });

    // Two-sided marketplace: proactively notify buyers whose buy-box just
    // cleared on this lead. Fire-and-forget — a notification failure must
    // never fail the scoring request that triggered it.
    void this.buyerNotification.notifyMatchingBuyers(operatorId, updatedLead).catch((err: unknown) => {
      this.logger.warn('Buyer notification dispatch failed', {
        leadId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    this.logger.info('Lead scored', {
      leadId,
      composite,
      confidence,
      modelVersion,
      mlProbability,
      durationMs: Date.now() - start,
    });

    return result;
  }

  /**
   * Blends the three dimension scores using the operator's learned weights
   * (populated by the retraining loop). Falls back to the repository's
   * built-in defaults (0.4 / 0.4 / 0.2) when no retraining has happened yet.
   */
  private async computeWeightedComposite(
    operatorId: OperatorId,
    dealScore: number,
    motivationScore: number,
    urgencyScore: number,
  ): Promise<number> {
    const weights = await this.weightsRepo.getCurrent(operatorId);
    const composite =
      dealScore * weights.dealWeight +
      motivationScore * weights.motivationWeight +
      urgencyScore * weights.urgencyWeight;
    return this.clamp(Math.round(composite));
  }

  private computeDealScore(lead: Lead): { readonly score: number; readonly factors: ScoreFactor[] } {
    const factors: ScoreFactor[] = [];
    const { metrics } = lead;
    let raw = 40;

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
      } else if (equityRatio <= 0) {
        raw -= 15;
        factors.push({
          name: 'underwater',
          value: -0.8,
          weight: 0.4,
          description: 'Asking price exceeds ARV minus repairs',
        });
      }
    }

    if (metrics.arv && metrics.repairEstimate !== undefined && metrics.maxOffer) {
      const target = metrics.arv * 0.7 - metrics.repairEstimate;
      if (metrics.maxOffer <= target) {
        raw += 15;
        factors.push({
          name: 'satisfies_70_rule',
          value: 0.7,
          weight: 0.3,
          description: 'Max offer within 70% rule',
        });
      }
    }

    return { score: this.clamp(raw), factors };
  }

  private computeMotivationScore(
    lead: Lead,
    features: InteractionFeatures,
  ): { readonly score: number; readonly factors: ScoreFactor[] } {
    const factors: ScoreFactor[] = [];
    let raw = 30;

    switch (lead.motivation) {
      case MotivationLevel.URGENT:
        raw += 50;
        factors.push({ name: 'urgent_motivation', value: 1, weight: 0.5, description: 'Urgent' });
        break;
      case MotivationLevel.HIGH:
        raw += 35;
        factors.push({ name: 'high_motivation', value: 0.8, weight: 0.4, description: 'High motivation' });
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

    if (lead.source === LeadSource.PROBATE) {
      raw += 15;
      factors.push({ name: 'probate_source', value: 0.7, weight: 0.3, description: 'Probate source' });
    }

    if (features.hasAppointment) {
      raw += 15;
      factors.push({ name: 'appointment_set', value: 0.9, weight: 0.4, description: 'Appointment' });
    }
    if (features.responseRate > 0.5) {
      raw += 10;
    }

    return { score: this.clamp(raw), factors };
  }

  private computeUrgencyScore(
    _lead: Lead,
    features: InteractionFeatures,
  ): { readonly score: number; readonly factors: ScoreFactor[] } {
    const factors: ScoreFactor[] = [];
    let raw = 40;

    if (features.hasContract) {
      raw += 40;
      factors.push({ name: 'contract_signed', value: 1, weight: 0.5, description: 'Contract signed' });
    } else if (features.hasOffer) {
      raw += 25;
      factors.push({ name: 'offer_made', value: 0.8, weight: 0.4, description: 'Offer made' });
    }

    if (features.daysSinceLastContact > 14) {
      raw -= 15;
      factors.push({
        name: 'stale_lead',
        value: -0.6,
        weight: 0.3,
        description: `${features.daysSinceLastContact} days since last contact`,
      });
    }

    return { score: this.clamp(raw), factors };
  }

  private computeHeuristicConfidence(lead: Lead, features: InteractionFeatures): number {
    let signals = 0;
    if (lead.metrics.arv) signals++;
    if (lead.metrics.repairEstimate !== undefined) signals++;
    if (lead.metrics.askingPrice) signals++;
    if (lead.property.condition && lead.property.condition !== PropertyCondition.UNKNOWN) signals++;
    if (lead.motivation !== MotivationLevel.UNKNOWN) signals++;
    if (features.totalInteractions > 3) signals++;
    return Math.min(1, signals / 6);
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
    parts.push(`${lead.property.address}, ${lead.property.city} ${lead.property.state}`);
    parts.push(`Source: ${lead.source}, Motivation: ${lead.motivation}`);
    if (lead.metrics.arv) parts.push(`ARV: $${(lead.metrics.arv / 100).toLocaleString()}`);
    if (lead.metrics.askingPrice) parts.push(`Asking: $${(lead.metrics.askingPrice / 100).toLocaleString()}`);
    return parts.join(' | ');
  }

  /**
   * "Why this score" drill-down for the lead detail page: the most recent
   * persisted score's per-dimension factor contributions, plus how the
   * operator's composite weights have drifted since `lookbackDays` ago
   * (default 30) — e.g. "urgency now matters 12% more than 30 days ago".
   *
   * Uses the lead's most recent ScoreHistory entry rather than recomputing
   * a score, so this reflects exactly what's shown on the lead record —
   * calling this never re-triggers a Gemini call or ML inference.
   */
  public async getScoreDrillDown(
    operatorId: OperatorId,
    leadId: LeadId,
    lookbackDays = 30,
  ): Promise<ScoreDrillDown | null> {
    const [history, currentWeights] = await Promise.all([
      this.scoreHistoryRepo.findByLead(operatorId, leadId, 1),
      this.weightsRepo.getCurrent(operatorId),
    ]);

    const latest = history[0];
    if (!latest) return null;

    const asOf = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString() as IsoTimestamp;
    const previousEntry = await this.weightsRepo.findAsOf(operatorId, asOf);

    if (!previousEntry) {
      return {
        score: latest.score,
        currentWeights,
        driftAvailable: false,
        weightDrift: [],
      };
    }

    const previous = previousEntry.weights;
    const weightDrift: ScoreDrillDown['weightDrift'] = [
      {
        dimension: 'deal',
        currentWeight: currentWeights.dealWeight,
        previousWeight: previous.dealWeight,
        delta: currentWeights.dealWeight - previous.dealWeight,
      },
      {
        dimension: 'motivation',
        currentWeight: currentWeights.motivationWeight,
        previousWeight: previous.motivationWeight,
        delta: currentWeights.motivationWeight - previous.motivationWeight,
      },
      {
        dimension: 'urgency',
        currentWeight: currentWeights.urgencyWeight,
        previousWeight: previous.urgencyWeight,
        delta: currentWeights.urgencyWeight - previous.urgencyWeight,
      },
    ];

    return {
      score: latest.score,
      currentWeights,
      driftAvailable: true,
      comparedAgainst: previous.trainedAt,
      weightDrift,
    };
  }
}

export function createScoringService(deps: {
  readonly leadRepo: LeadRepository;
  readonly interactionRepo: InteractionRepository;
  readonly scoreHistoryRepo: ScoreHistoryRepository;
  readonly weightsRepo: ScoringWeightsRepository;
  readonly gemini: GeminiService;
  readonly modelRegistry: ModelRegistryService;
  readonly inference: OnnxInferenceService;
  readonly featureExtractor: MlFeatureExtractorService;
  readonly eventPublisher: EventPublisherService;
  readonly buyerNotification: BuyerNotificationService;
  readonly logger: Logger;
}): ScoringService {
  return new ScoringService(
    deps.leadRepo,
    deps.interactionRepo,
    deps.scoreHistoryRepo,
    deps.weightsRepo,
    deps.gemini,
    deps.modelRegistry,
    deps.inference,
    deps.featureExtractor,
    deps.eventPublisher,
    deps.buyerNotification,
    deps.logger,
  );
}

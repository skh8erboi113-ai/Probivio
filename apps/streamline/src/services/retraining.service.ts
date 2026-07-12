import { LeadStatus, type IsoTimestamp, type OperatorId, type ScoringWeights } from '@listinglogic/types';

import type {
  InteractionRepository,
  LeadRepository,
  ScoreHistoryRepository,
  ScoringWeightsRepository,
} from '@listinglogic/db';
import type { Logger } from '@listinglogic/logger';

/**
 * Lightweight per-operator retraining loop.
 *
 * This is intentionally NOT a full gradient-boosted retrain (that lives in
 * services/ml-trainer, the Python job that produces ONNX artifacts). This
 * service re-derives the three composite weights (deal / motivation / urgency)
 * from realized outcomes in score history, so the heuristic scorer keeps
 * improving even for operators without enough volume for a full ML model.
 */
export interface RetrainingResult {
  readonly operatorId: OperatorId;
  readonly weights: ScoringWeights;
  readonly sampleSize: number;
}

const MIN_SAMPLES_TO_RETRAIN = 25;
const LOOKBACK_DAYS = 90;

export class RetrainingService {
  private readonly logger: Logger;

  constructor(
    private readonly leadRepo: LeadRepository,
    private readonly interactionRepo: InteractionRepository,
    private readonly scoreHistoryRepo: ScoreHistoryRepository,
    private readonly weightsRepo: ScoringWeightsRepository,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'retraining' });
  }

  /**
   * Retrain composite weights for a single operator.
   * Returns null if there isn't enough score-history volume yet.
   */
  public async retrainForOperator(operatorId: OperatorId): Promise<RetrainingResult | null> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString() as IsoTimestamp;

    const samples: { dealScore: number; motivationScore: number; urgencyScore: number; outcome: number }[] = [];
    const leadOutcomeCache = new Map<string, number>();

    const POSITIVE_STATUSES: readonly string[] = [LeadStatus.UNDER_CONTRACT, LeadStatus.CLOSED_WON];
    const NEGATIVE_STATUSES: readonly string[] = [LeadStatus.CLOSED_LOST, LeadStatus.DEAD];

    for await (const entry of this.scoreHistoryRepo.iterateForTraining(operatorId, since)) {
      let outcome = leadOutcomeCache.get(entry.leadId);

      if (outcome === undefined) {
        // Outcome label: did the lead progress to a deal (positive) or die (negative)?
        // Falls back to "did this score improve vs. the prior one" when the lead is
        // still open, since we don't have a terminal outcome to learn from yet.
        const lead = await this.leadRepo.findById(operatorId, entry.leadId);

        if (lead && POSITIVE_STATUSES.includes(lead.status)) {
          outcome = 1;
        } else if (lead && NEGATIVE_STATUSES.includes(lead.status)) {
          outcome = 0;
        } else {
          // Lead is still open — fall back to interaction-derived engagement
          // signals (offer/contract/appointment) as a proxy for "this scoring
          // is steering the operator toward a good lead".
          const features = await this.interactionRepo.computeFeatures(operatorId, entry.leadId);
          if (features.hasContract || features.hasOffer || features.hasAppointment) {
            outcome = 1;
          } else {
            outcome =
              entry.previousComposite === undefined || entry.score.composite >= entry.previousComposite ? 1 : 0;
          }
        }

        leadOutcomeCache.set(entry.leadId, outcome);
      }

      samples.push({
        dealScore: entry.score.dealScore,
        motivationScore: entry.score.motivationScore,
        urgencyScore: entry.score.urgencyScore,
        outcome,
      });
    }

    if (samples.length < MIN_SAMPLES_TO_RETRAIN) {
      this.logger.info('Skipping retrain — insufficient samples', {
        operatorId,
        sampleSize: samples.length,
        required: MIN_SAMPLES_TO_RETRAIN,
      });
      return null;
    }

    const weights = this.deriveWeights(samples);
    await this.weightsRepo.save(operatorId, weights);

    this.logger.info('Retraining complete', {
      operatorId,
      sampleSize: samples.length,
      version: weights.version,
    });

    return { operatorId, weights, sampleSize: samples.length };
  }

  /**
   * Correlation-based weight derivation.
   *
   * For each dimension, compute how well it alone predicts the outcome using a
   * simple point-biserial style correlation, then normalize into weights that
   * sum to 1. This is a purposefully simple, explainable heuristic — the full
   * gradient-boosted model in services/ml-trainer supersedes this once an
   * operator has enough volume for ONNX inference.
   */
  private deriveWeights(
    samples: readonly { dealScore: number; motivationScore: number; urgencyScore: number; outcome: number }[],
  ): ScoringWeights {
    const dealCorr = Math.abs(this.correlation(samples.map((s) => s.dealScore), samples.map((s) => s.outcome)));
    const motivationCorr = Math.abs(
      this.correlation(samples.map((s) => s.motivationScore), samples.map((s) => s.outcome)),
    );
    const urgencyCorr = Math.abs(
      this.correlation(samples.map((s) => s.urgencyScore), samples.map((s) => s.outcome)),
    );

    const total = dealCorr + motivationCorr + urgencyCorr;

    // Fall back to defaults if correlations are degenerate (e.g. zero variance).
    const [dealWeight, motivationWeight, urgencyWeight] =
      total > 0
        ? [dealCorr / total, motivationCorr / total, urgencyCorr / total]
        : [0.4, 0.4, 0.2];

    const positiveOutcomes = samples.filter((s) => s.outcome === 1).length;
    const validationAccuracy = positiveOutcomes / samples.length;

    return {
      dealWeight,
      motivationWeight,
      urgencyWeight,
      version: `retrained-${Date.now()}`,
      trainedAt: new Date().toISOString() as IsoTimestamp,
      trainingSampleSize: samples.length,
      validationAccuracy,
    };
  }

  private correlation(xs: readonly number[], ys: readonly number[]): number {
    const n = xs.length;
    if (n === 0) return 0;

    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i += 1) {
      const dx = (xs[i] ?? 0) - meanX;
      const dy = (ys[i] ?? 0) - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
  }
}

export function createRetrainingService(deps: {
  readonly leadRepo: LeadRepository;
  readonly interactionRepo: InteractionRepository;
  readonly scoreHistoryRepo: ScoreHistoryRepository;
  readonly weightsRepo: ScoringWeightsRepository;
  readonly logger: Logger;
}): RetrainingService {
  return new RetrainingService(
    deps.leadRepo,
    deps.interactionRepo,
    deps.scoreHistoryRepo,
    deps.weightsRepo,
    deps.logger,
  );
}

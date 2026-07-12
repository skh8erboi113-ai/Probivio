import { describe, it, expect, vi } from 'vitest';

import type { LeadId, OperatorId, IsoTimestamp } from '@listinglogic/types';
import type { LeadRepository, InteractionRepository, ScoreHistoryRepository, ScoringWeightsRepository, ScoringWeights } from '@listinglogic/db';
import type { GeminiService } from '../../src/services/gemini.service';
import type { ModelRegistryService } from '../../src/services/model-registry.service';
import type { OnnxInferenceService } from '../../src/services/onnx-inference.service';
import type { MlFeatureExtractorService } from '../../src/services/ml-feature-extractor.service';
import type { EventPublisherService } from '../../src/realtime/event-publisher.service';
import type { BuyerNotificationService } from '../../src/services/buyer-notification.service';

import { ScoringService } from '../../src/services/scoring.service';
import { operatorId, makeLead } from '../factories';

describe('ScoringService.scoreLead', () => {
  it('computes a composite score and persists history + lead score', async () => {
    const op = operatorId as unknown as OperatorId;
    const lead = makeLead({ id: 'lead_1' as any, operatorId: op as any });

    const leadRepo = {
      findByIdOrThrow: vi.fn(async () => lead),
      applyScore: vi.fn(async () => ({ ...lead, score: 97, scoreConfidence: 0.85, scoredAt: new Date().toISOString() })),
    } as unknown as LeadRepository;

    const interactionRepo = {
      computeFeatures: vi.fn(async () => ({
        totalInteractions: 6,
        positiveCount: 4,
        negativeCount: 0,
        responseRate: 0.6,
        avgResponseTimeMinutes: 30,
        daysSinceFirstContact: 5,
        daysSinceLastContact: 0,
        hasAppointment: true,
        hasOffer: true,
        hasContract: false,
      })),
    } as unknown as InteractionRepository;

    const weightsRepo = {
      getCurrent: vi.fn(async () => ({
        dealWeight: 0.4,
        motivationWeight: 0.4,
        urgencyWeight: 0.2,
        version: 'test-v1',
        trainedAt: new Date(0).toISOString() as IsoTimestamp,
        trainingSampleSize: 100,
        validationAccuracy: 0.9,
      } satisfies ScoringWeights)),
    } as unknown as ScoringWeightsRepository;

    const scoreHistoryRepo = {
      findByLead: vi.fn(async () => []),
      record: vi.fn(async (_operatorId, _leadId, _score, _triggeredBy, _previousComposite) => {
        return undefined;
      }),
    } as unknown as ScoreHistoryRepository;

    const gemini = {
      explainScore: vi.fn(async () => 'Unit test explanation'),
    } as unknown as GeminiService;

    // No trained model registered — forces the heuristic (weighted composite) path.
    const modelRegistry = {
      getModel: vi.fn(async () => null),
    } as unknown as ModelRegistryService;

    const inference = {
      predict: vi.fn(async () => 0.5),
    } as unknown as OnnxInferenceService;

    const featureExtractor = {
      extract: vi.fn(() => new Float32Array()),
    } as unknown as MlFeatureExtractorService;

    const eventPublisher = {
      publish: vi.fn(),
    } as unknown as EventPublisherService;

    const buyerNotification = {
      notifyMatchingBuyers: vi.fn(async () => undefined),
    } as unknown as BuyerNotificationService;

    const logger = {
      child: () => logger,
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
    } as any;

    const service = new ScoringService(
      leadRepo,
      interactionRepo,
      scoreHistoryRepo,
      weightsRepo,
      gemini,
      modelRegistry,
      inference,
      featureExtractor,
      eventPublisher,
      buyerNotification,
      logger,
    );

    const result = await service.scoreLead(op, 'lead_1' as unknown as LeadId, 'manual');

    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(100);
    expect(result.explanation).toBe('Unit test explanation');
    expect(result.recommendation).toBeDefined();

    expect(leadRepo.applyScore).toHaveBeenCalledTimes(1);
    expect(scoreHistoryRepo.record).toHaveBeenCalledTimes(1);
    expect(gemini.explainScore).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);

    // Buyer notification dispatch is fire-and-forget; give the microtask queue
    // a tick to flush the `void ...catch()` before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(buyerNotification.notifyMatchingBuyers).toHaveBeenCalledTimes(1);
  });
});

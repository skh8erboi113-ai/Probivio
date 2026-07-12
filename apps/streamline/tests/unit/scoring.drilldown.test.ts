import { describe, expect, it, vi } from 'vitest';

import { ScoringService } from '../../src/services/scoring.service.js';

import type {
  InteractionRepository,
  LeadRepository,
  ScoreHistoryRepository,
  ScoringWeightsRepository,
} from '@probivio/db';
import type { GeminiService } from '../../src/services/gemini.service.js';
import type { ModelRegistryService } from '../../src/services/model-registry.service.js';
import type { OnnxInferenceService } from '../../src/services/onnx-inference.service.js';
import type { MlFeatureExtractorService } from '../../src/services/ml-feature-extractor.service.js';
import type { EventPublisherService } from '../../src/realtime/event-publisher.service.js';
import type { BuyerNotificationService } from '../../src/services/buyer-notification.service.js';
import type { IsoTimestamp, LeadId, OperatorId, ScoreHistory } from '@probivio/types';

function makeLogger() {
  return {
    child: () => makeLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const OPERATOR_ID = 'op_test' as unknown as OperatorId;
const LEAD_ID = 'lead_1' as unknown as LeadId;

const SCORE_HISTORY_ENTRY: ScoreHistory = {
  id: 'hist_1' as never,
  leadId: LEAD_ID,
  operatorId: OPERATOR_ID,
  createdAt: new Date().toISOString() as never,
  updatedAt: new Date().toISOString() as never,
  triggeredBy: 'manual',
  score: {
    dealScore: 80,
    motivationScore: 70,
    urgencyScore: 60,
    composite: 74,
    confidence: 0.8,
    explanation: 'test explanation',
    recommendation: 'pursue' as never,
    topFactors: [{ name: 'strong_equity', value: 0.9, weight: 0.4, description: '40% equity spread' }],
    modelVersion: 'test-v1',
    scoredAt: new Date().toISOString() as IsoTimestamp,
  },
};

function buildService(overrides?: {
  readonly findByLead?: ReturnType<typeof vi.fn>;
  readonly getCurrent?: ReturnType<typeof vi.fn>;
  readonly findAsOf?: ReturnType<typeof vi.fn>;
}) {
  const leadRepo = {} as unknown as LeadRepository;
  const interactionRepo = {} as unknown as InteractionRepository;

  const scoreHistoryRepo = {
    findByLead: overrides?.findByLead ?? vi.fn().mockResolvedValue([SCORE_HISTORY_ENTRY]),
  } as unknown as ScoreHistoryRepository;

  const weightsRepo = {
    getCurrent:
      overrides?.getCurrent ??
      vi.fn().mockResolvedValue({
        dealWeight: 0.5,
        motivationWeight: 0.3,
        urgencyWeight: 0.2,
        version: 'v2',
        trainedAt: new Date().toISOString() as IsoTimestamp,
        trainingSampleSize: 50,
        validationAccuracy: 0.8,
      }),
    findAsOf: overrides?.findAsOf ?? vi.fn().mockResolvedValue(null),
  } as unknown as ScoringWeightsRepository;

  const gemini = {} as unknown as GeminiService;
  const modelRegistry = {} as unknown as ModelRegistryService;
  const inference = {} as unknown as OnnxInferenceService;
  const featureExtractor = {} as unknown as MlFeatureExtractorService;
  const eventPublisher = {} as unknown as EventPublisherService;
  const buyerNotification = {} as unknown as BuyerNotificationService;

  return new ScoringService(
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
    makeLogger(),
  );
}

describe('ScoringService.getScoreDrillDown', () => {
  it('returns null when the lead has no score history yet', async () => {
    const service = buildService({ findByLead: vi.fn().mockResolvedValue([]) });
    const result = await service.getScoreDrillDown(OPERATOR_ID, LEAD_ID);
    expect(result).toBeNull();
  });

  it('returns the score with driftAvailable=false when there is no older weight snapshot', async () => {
    const service = buildService();
    const result = await service.getScoreDrillDown(OPERATOR_ID, LEAD_ID);

    expect(result).not.toBeNull();
    expect(result?.driftAvailable).toBe(false);
    expect(result?.weightDrift).toEqual([]);
    expect(result?.score.topFactors).toHaveLength(1);
  });

  it('computes per-dimension drift deltas against the weights active N days ago', async () => {
    const findAsOf = vi.fn().mockResolvedValue({
      id: 'wh_1',
      operatorId: OPERATOR_ID,
      weights: {
        dealWeight: 0.4,
        motivationWeight: 0.4,
        urgencyWeight: 0.2,
        version: 'v1',
        trainedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() as IsoTimestamp,
        trainingSampleSize: 25,
        validationAccuracy: 0.7,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const service = buildService({ findAsOf });
    const result = await service.getScoreDrillDown(OPERATOR_ID, LEAD_ID, 30);

    expect(result?.driftAvailable).toBe(true);
    expect(result?.comparedAgainst).toBeDefined();

    const urgency = result?.weightDrift.find((d) => d.dimension === 'urgency');
    expect(urgency?.currentWeight).toBeCloseTo(0.2);
    expect(urgency?.previousWeight).toBeCloseTo(0.2);
    expect(urgency?.delta).toBeCloseTo(0);

    const deal = result?.weightDrift.find((d) => d.dimension === 'deal');
    expect(deal?.delta).toBeCloseTo(0.1); // 0.5 - 0.4

    const motivation = result?.weightDrift.find((d) => d.dimension === 'motivation');
    expect(motivation?.delta).toBeCloseTo(-0.1); // 0.3 - 0.4
  });
});

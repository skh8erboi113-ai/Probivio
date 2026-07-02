import { describe, it, expect, vi } from 'vitest';

import type { LeadId, OperatorId } from '@listinglogic/types';
import type { LeadRepository, InteractionRepository, ScoreHistoryRepository, ScoringWeightsRepository, ScoringWeights, ScoreResult } from '@listinglogic/db';
import type { GeminiService } from '../../src/services/gemini.service';

import { ScoringService } from '../../src/services/scoring.service';
import { operatorId, makeLead } from '../factories';
import type { IsoTimestamp } from '@listinglogic/types';

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
      record: vi.fn(async (_operatorId, _leadId, _score, _triggeredBy, _previousComposite) => {
        return undefined;
      }),
    } as unknown as ScoreHistoryRepository;

    const gemini = {
      explainScore: vi.fn(async () => 'Unit test explanation'),
    } as unknown as GeminiService;

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
  });
});

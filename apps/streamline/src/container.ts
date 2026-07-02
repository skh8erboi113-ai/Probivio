import type { Logger } from '@listinglogic/logger';
import {
  AutomationRepository,
  BuyerRepository,
  IdempotencyRepository,
  InteractionRepository,
  LeadRepository,
  ProbateRepository,
  ScoreHistoryRepository,
  ScoringWeightsRepository,
} from '@listinglogic/db';

import { getLogger } from './config/logger.js';
import { AutomationService, createAutomationService } from './services/automation.service.js';
import { BuyerMatchingService, createBuyerMatchingService } from './services/buyer-matching.service.js';
import { createGeminiService, GeminiService } from './services/gemini.service.js';
import { createProbateService, ProbateService } from './services/probate.service.js';
import { createRetrainingService, RetrainingService } from './services/retraining.service.js';
import { createScoringService, ScoringService } from './services/scoring.service.js';
import { createSendGridService, SendGridService } from './services/sendgrid.service.js';
import { createTwilioService, TwilioService } from './services/twilio.service.js';

/**
 * Dependency container.
 * Composed once at startup — no runtime service location, no globals.
 */

export interface AppContainer {
  readonly logger: Logger;

  // Repositories
  readonly leadRepo: LeadRepository;
  readonly buyerRepo: BuyerRepository;
  readonly probateRepo: ProbateRepository;
  readonly automationRepo: AutomationRepository;
  readonly interactionRepo: InteractionRepository;
  readonly scoreHistoryRepo: ScoreHistoryRepository;
  readonly weightsRepo: ScoringWeightsRepository;
  readonly idempotencyRepo: IdempotencyRepository;

  // Services
  readonly gemini: GeminiService;
  readonly twilio: TwilioService;
  readonly sendgrid: SendGridService;
  readonly scoringService: ScoringService;
  readonly retrainingService: RetrainingService;
  readonly buyerMatchingService: BuyerMatchingService;
  readonly probateService: ProbateService;
  readonly automationService: AutomationService;
}

export function buildContainer(): AppContainer {
  const logger = getLogger();

  // Repositories
  const leadRepo = new LeadRepository(logger);
  const buyerRepo = new BuyerRepository(logger);
  const probateRepo = new ProbateRepository(logger);
  const automationRepo = new AutomationRepository(logger);
  const interactionRepo = new InteractionRepository(logger);
  const scoreHistoryRepo = new ScoreHistoryRepository(logger);
  const weightsRepo = new ScoringWeightsRepository(logger);
  const idempotencyRepo = new IdempotencyRepository(logger);

  // External-service clients
  const gemini = createGeminiService(logger);
  const twilio = createTwilioService(logger);
  const sendgrid = createSendGridService(logger);

  // Domain services
  const scoringService = createScoringService({
    leadRepo,
    interactionRepo,
    scoreHistoryRepo,
    weightsRepo,
    gemini,
    logger,
  });

  const retrainingService = createRetrainingService({
    leadRepo,
    interactionRepo,
    scoreHistoryRepo,
    weightsRepo,
    logger,
  });

  const buyerMatchingService = createBuyerMatchingService({ leadRepo, buyerRepo, logger });
  const probateService = createProbateService({ probateRepo, gemini, logger });

  const automationService = createAutomationService({
    automationRepo,
    leadRepo,
    interactionRepo,
    twilio,
    sendgrid,
    logger,
  });

  return {
    logger,
    leadRepo,
    buyerRepo,
    probateRepo,
    automationRepo,
    interactionRepo,
    scoreHistoryRepo,
    weightsRepo,
    idempotencyRepo,
    gemini,
    twilio,
    sendgrid,
    scoringService,
    retrainingService,
    buyerMatchingService,
    probateService,
    automationService,
  };
}

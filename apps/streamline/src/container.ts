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
import {
  createEventPublisherService,
  EventPublisherService,
} from './realtime/event-publisher.service.js';
import { AutomationService, createAutomationService } from './services/automation.service.js';
import { BuyerMatchingService, createBuyerMatchingService } from './services/buyer-matching.service.js';
import { createGeminiService, GeminiService } from './services/gemini.service.js';
import {
  createMlFeatureExtractorService,
  MlFeatureExtractorService,
} from './services/ml-feature-extractor.service.js';
import {
  createModelRegistryService,
  ModelRegistryService,
} from './services/model-registry.service.js';
import { createOnnxInferenceService, OnnxInferenceService } from './services/onnx-inference.service.js';
import { createOpsAlertsService, OpsAlertsService } from './services/ops-alerts.service.js';
import { createPdfParserService, PdfParserService } from './services/pdf-parser.service.js';
import { createProbateService, ProbateService } from './services/probate.service.js';
import { createRetrainingService, RetrainingService } from './services/retraining.service.js';
import { createScoringService, ScoringService } from './services/scoring.service.js';
import { createSendGridService, SendGridService } from './services/sendgrid.service.js';
import { createSkipTraceService, SkipTraceService } from './services/skip-trace.service.js';
import { createTaskQueueService, TaskQueueService } from './services/task-queue.service.js';
import { createTwilioService, TwilioService } from './services/twilio.service.js';

export interface AppContainer {
  readonly logger: Logger;

  readonly leadRepo: LeadRepository;
  readonly buyerRepo: BuyerRepository;
  readonly probateRepo: ProbateRepository;
  readonly automationRepo: AutomationRepository;
  readonly interactionRepo: InteractionRepository;
  readonly scoreHistoryRepo: ScoreHistoryRepository;
  readonly weightsRepo: ScoringWeightsRepository;
  readonly idempotencyRepo: IdempotencyRepository;

  readonly gemini: GeminiService;
  readonly twilio: TwilioService;
  readonly sendgrid: SendGridService;
  readonly pdfParser: PdfParserService;
  readonly skipTrace: SkipTraceService;
  readonly taskQueue: TaskQueueService;
  readonly opsAlerts: OpsAlertsService;

  readonly modelRegistry: ModelRegistryService;
  readonly onnxInference: OnnxInferenceService;
  readonly featureExtractor: MlFeatureExtractorService;

  readonly eventPublisher: EventPublisherService;

  readonly scoringService: ScoringService;
  readonly retrainingService: RetrainingService;
  readonly buyerMatchingService: BuyerMatchingService;
  readonly probateService: ProbateService;
  readonly automationService: AutomationService;
}

export function buildContainer(): AppContainer {
  const logger = getLogger();

  const leadRepo = new LeadRepository(logger);
  const buyerRepo = new BuyerRepository(logger);
  const probateRepo = new ProbateRepository(logger);
  const automationRepo = new AutomationRepository(logger);
  const interactionRepo = new InteractionRepository(logger);
  const scoreHistoryRepo = new ScoreHistoryRepository(logger);
  const weightsRepo = new ScoringWeightsRepository(logger);
  const idempotencyRepo = new IdempotencyRepository(logger);

  const gemini = createGeminiService(logger);
  const twilio = createTwilioService(logger);
  const sendgrid = createSendGridService(logger);
  const pdfParser = createPdfParserService(logger);
  const skipTrace = createSkipTraceService(logger);
  const taskQueue = createTaskQueueService(logger);
  const opsAlerts = createOpsAlertsService(logger);

  const modelRegistry = createModelRegistryService({ weightsRepo, logger });
  const onnxInference = createOnnxInferenceService(logger);
  const featureExtractor = createMlFeatureExtractorService();

  const eventPublisher = createEventPublisherService(logger);

  const scoringService = createScoringService({
    leadRepo,
    interactionRepo,
    scoreHistoryRepo,
    weightsRepo,
    gemini,
    modelRegistry,
    inference: onnxInference,
    featureExtractor,
    eventPublisher,
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
  const probateService = createProbateService({ probateRepo, gemini, pdfParser, logger });

  const automationService = createAutomationService({
    automationRepo,
    leadRepo,
    interactionRepo,
    twilio,
    sendgrid,
    eventPublisher,
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
    pdfParser,
    skipTrace,
    taskQueue,
    opsAlerts,
    modelRegistry,
    onnxInference,
    featureExtractor,
    eventPublisher,
    scoringService,
    retrainingService,
    buyerMatchingService,
    probateService,
    automationService,
  };
}

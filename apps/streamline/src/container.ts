import {
  AgentDecisionLogRepository,
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
  type EventPublisherService,
} from './realtime/event-publisher.service.js';
import { type AgentService, createAgentService } from './services/agent.service.js';
import { type BuyerMatchingService, createBuyerMatchingService } from './services/buyer-matching.service.js';
import { createGeminiService, type GeminiService } from './services/gemini.service.js';
import {
  createMlFeatureExtractorService,
  type MlFeatureExtractorService,
} from './services/ml-feature-extractor.service.js';
import {
  createModelRegistryService,
  type ModelRegistryService,
} from './services/model-registry.service.js';
import { createOnnxInferenceService, type OnnxInferenceService } from './services/onnx-inference.service.js';
import { createOpsAlertsService, type OpsAlertsService } from './services/ops-alerts.service.js';
import { createPdfParserService, type PdfParserService } from './services/pdf-parser.service.js';
import { createProbateService, type ProbateService } from './services/probate.service.js';
import { createRetrainingService, type RetrainingService } from './services/retraining.service.js';
import { createScoringService, type ScoringService } from './services/scoring.service.js';
import { createSendGridService, type SendGridService } from './services/sendgrid.service.js';
import { createSkipTraceService, type SkipTraceService } from './services/skip-trace.service.js';
import { createTaskQueueService, type TaskQueueService } from './services/task-queue.service.js';

import type { Logger } from '@listinglogic/logger';

export interface AppContainer {
  readonly logger: Logger;

  readonly leadRepo: LeadRepository;
  readonly buyerRepo: BuyerRepository;
  readonly probateRepo: ProbateRepository;
  readonly decisionLogRepo: AgentDecisionLogRepository;
  readonly interactionRepo: InteractionRepository;
  readonly scoreHistoryRepo: ScoreHistoryRepository;
  readonly weightsRepo: ScoringWeightsRepository;
  readonly idempotencyRepo: IdempotencyRepository;

  readonly gemini: GeminiService;
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
  readonly agentService: AgentService;
}

export function buildContainer(): AppContainer {
  const logger = getLogger();

  const leadRepo = new LeadRepository(logger);
  const buyerRepo = new BuyerRepository(logger);
  const probateRepo = new ProbateRepository(logger);
  const decisionLogRepo = new AgentDecisionLogRepository(logger);
  const interactionRepo = new InteractionRepository(logger);
  const scoreHistoryRepo = new ScoreHistoryRepository(logger);
  const weightsRepo = new ScoringWeightsRepository(logger);
  const idempotencyRepo = new IdempotencyRepository(logger);

  const gemini = createGeminiService(logger);
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

  const agentService = createAgentService({
    leadRepo,
    interactionRepo,
    decisionLogRepo,
    gemini,
    sendgrid,
    eventPublisher,
    logger,
  });

  return {
    logger,
    leadRepo,
    buyerRepo,
    probateRepo,
    decisionLogRepo,
    interactionRepo,
    scoreHistoryRepo,
    weightsRepo,
    idempotencyRepo,
    gemini,
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
    agentService,
  };
}

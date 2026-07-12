import { initializeFirebase, shutdownFirebase } from '@probivio/db';

import { createApp } from './app.js';
import { loadConfig } from './config/config.js';
import { getLogger } from './config/logger.js';
import { buildContainer } from './container.js';
import { shutdownRateLimit } from './middleware/rate-limit.js';
import { getPubSub } from './realtime/pubsub.js';
import { createRealtimeWebSocketServer } from './realtime/websocket-server.js';
import { createAgentRouter } from './routes/agent.routes.js';
import { createBuyerRouter } from './routes/buyer.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createInteractionRouter } from './routes/interaction.routes.js';
import { createLeadRouter } from './routes/lead.routes.js';
import { createOpenApiRouter } from './routes/openapi.routes.js';
import { createProbateRouter } from './routes/probate.routes.js';
import { createRetrainingRouter } from './routes/retraining.routes.js';
import { createSchedulerRouter } from './routes/scheduler.routes.js';
import { createTaskCallbackRouter } from './routes/task-callback.routes.js';

import type { Router } from 'express';

// eslint-disable-next-line require-await, @typescript-eslint/require-await -- kept async for a uniform `main().catch()` entrypoint pattern
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = getLogger();

  logger.info('Starting Streamline API', {
    version: '2.1.0',
    env: config.env,
    port: config.port,
  });

  initializeFirebase(
    {
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    },
    logger,
  );

  const container = buildContainer();

  const routers: { readonly path: string; readonly router: Router }[] = [
    { path: '/', router: createHealthRouter({ geminiEnabled: () => container.gemini.isEnabled() }) },
    { path: '/', router: createOpenApiRouter() },
    {
      path: '/api/leads',
      router: createLeadRouter({
        leadRepo: container.leadRepo,
        scoringService: container.scoringService,
        agentService: container.agentService,
        eventPublisher: container.eventPublisher,
        skipTrace: container.skipTrace,
      }),
    },
    {
      path: '/api/buyers',
      router: createBuyerRouter({
        buyerRepo: container.buyerRepo,
        buyerMatching: container.buyerMatchingService,
        eventPublisher: container.eventPublisher,
      }),
    },
    {
      path: '/api/interactions',
      router: createInteractionRouter({
        interactionRepo: container.interactionRepo,
        scoringService: container.scoringService,
        agentService: container.agentService,
        eventPublisher: container.eventPublisher,
      }),
    },
    {
      path: '/api/probate',
      router: createProbateRouter({
        probateRepo: container.probateRepo,
        probateService: container.probateService,
      }),
    },
    {
      path: '/api/agent',
      router: createAgentRouter({
        decisionLogRepo: container.decisionLogRepo,
        agentSettingsRepo: container.agentSettingsRepo,
        agentService: container.agentService,
      }),
    },
    {
      path: '/api/retraining',
      router: createRetrainingRouter({ retrainingService: container.retrainingService }),
    },
    {
      path: '/scheduler',
      router: createSchedulerRouter({
        retrainingService: container.retrainingService,
        agentService: container.agentService,
        leadRepo: container.leadRepo,
        modelRegistry: container.modelRegistry,
        opsAlerts: container.opsAlerts,
        logger,
      }),
    },
    {
      path: '/tasks',
      router: createTaskCallbackRouter({
        agentService: container.agentService,
        logger,
      }),
    },
  ];

  const app = createApp({ routers });
  const server = app.listen(config.port, () => {
    logger.info(`Streamline API listening on :${config.port}`);
  });

  const wss = createRealtimeWebSocketServer(logger);
  wss.attach(server);

  const shutdown = (signal: string): void => {
    logger.info('Shutdown signal received', { signal });

    server.close((err) => {
      if (err) logger.error('HTTP server close error', { error: err });

      void (async () => {
        try {
          await Promise.all([
            wss.shutdown(),
            getPubSub(logger).shutdown(),
            shutdownRateLimit(),
            shutdownFirebase(logger),
          ]);
        } catch (cleanupErr) {
          logger.error('Cleanup error during shutdown', { error: cleanupErr });
        }

        logger.info('Shutdown complete');
        process.exit(0);
      })();
    });

    setTimeout(() => {
      logger.error('Forced shutdown after 15s timeout');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err });
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});

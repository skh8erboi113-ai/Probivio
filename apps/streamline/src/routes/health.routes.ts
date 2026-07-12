import { pingFirestore } from '@listinglogic/db';
import { Router } from 'express';

import { pingRateLimit } from '../middleware/rate-limit.js';

import type { HealthResponse } from '@listinglogic/types';

export interface HealthRouterDeps {
  readonly geminiEnabled: () => boolean;
}

const START_TIME = Date.now();
const API_VERSION = '2.1.0';

/**
 * Liveness/readiness endpoint for Cloud Run + uptime monitors.
 * Never requires auth — this must always be reachable to diagnose outages.
 */
export function createHealthRouter(deps: HealthRouterDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const [firestoreOk, redisStatus] = await Promise.all([pingFirestore(), pingRateLimit()]);

    const geminiStatus: HealthResponse['checks']['gemini'] = deps.geminiEnabled() ? 'ok' : 'disabled';
    const redisCheck: HealthResponse['checks']['redis'] =
      redisStatus === 'ok' ? 'ok' : redisStatus === 'degraded' ? 'degraded' : 'disabled';

    const overall: HealthResponse['status'] = !firestoreOk
      ? 'down'
      : redisCheck === 'degraded'
        ? 'degraded'
        : 'ok';

    const body: HealthResponse = {
      status: overall,
      version: API_VERSION,
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        firestore: firestoreOk ? 'ok' : 'down',
        redis: redisCheck,
        gemini: geminiStatus,
      },
    };

    res.status(overall === 'down' ? 503 : 200).json(body);
  });

  // Minimal liveness probe — no dependency checks, just "is the process up".
  router.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return router;
}

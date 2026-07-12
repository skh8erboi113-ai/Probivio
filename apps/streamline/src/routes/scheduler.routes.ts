import { timingSafeEqual } from 'node:crypto';

import { runAgentSweepSchema } from '@probivio/validators';
import { Router } from 'express';

import { UnauthorizedError } from '../errors/app-errors.js';

import type { AgentService } from '../services/agent.service.js';
import type { ModelRegistryService } from '../services/model-registry.service.js';
import type { OpsAlertsService } from '../services/ops-alerts.service.js';
import type { RetrainingService } from '../services/retraining.service.js';
import type { LeadRepository } from '@probivio/db';
import type { Logger } from '@probivio/logger';
import type { OperatorId } from '@probivio/types';


/**
 * Endpoints invoked by Cloud Scheduler for periodic jobs.
 *
 * Auth: OIDC token verification via header — Cloud Scheduler signs each request
 * with the service account. In this app we verify a shared secret header for
 * simplicity; upgrade to full OIDC verification via `google-auth-library` in prod.
 */

export interface SchedulerRouterDeps {
  readonly retrainingService: RetrainingService;
  readonly agentService: AgentService;
  readonly leadRepo: LeadRepository;
  readonly modelRegistry: ModelRegistryService;
  readonly opsAlerts: OpsAlertsService;
  readonly logger: Logger;
}

const SCHEDULER_SECRET_HEADER = 'x-scheduler-secret';

/**
 * Constant-time secret comparison — avoids leaking secret length/prefix via
 * response-time side channels (`===` on strings short-circuits at the first
 * mismatched byte, so it's technically vulnerable to timing attacks).
 */
function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function createSchedulerRouter(deps: SchedulerRouterDeps): Router {
  const router = Router();
  const secret = process.env.SCHEDULER_SHARED_SECRET;

  // Guard middleware
  router.use((req, _res, next) => {
    if (!secret) {
      return next(new UnauthorizedError('Scheduler endpoints not configured'));
    }
    if (!secretsMatch(req.header(SCHEDULER_SECRET_HEADER), secret)) {
      deps.logger.warn('Scheduler request rejected', {
        ip: req.ip,
        headerPresent: Boolean(req.header(SCHEDULER_SECRET_HEADER)),
      });
      return next(new UnauthorizedError('Invalid scheduler secret'));
    }
    next();
  });

  // Nightly retraining sweep — iterates all operators
  router.post('/retrain-all', async (req, res, next) => {
    try {
      const body = req.body as { readonly operatorIds?: readonly string[] };
      const operatorIds = body.operatorIds ?? [];

      if (operatorIds.length === 0) {
        // In production, discover operators via a query against the operators collection
        res.json({ processed: 0, message: 'No operators specified' });
        return;
      }

      const results = await Promise.allSettled(
        operatorIds.map((id) => deps.retrainingService.retrainForOperator(id as never)),
      );

      const successCount = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
      const failureCount = results.filter((r) => r.status === 'rejected').length;

      deps.opsAlerts.dispatch({
        severity: failureCount > 0 ? 'warning' : 'info',
        title: 'Retraining sweep complete',
        message: `Processed ${operatorIds.length} operators`,
        metadata: {
          successful: successCount,
          failed: failureCount,
        },
      });

      res.json({
        processed: operatorIds.length,
        successful: successCount,
        failed: failureCount,
      });
    } catch (err) {
      next(err);
    }
  });

  // Periodic Gemini automation sweep — asks the agent to re-evaluate every
  // active lead for each operator, so leads get follow-up attention even
  // without a triggering event (new interaction, status change, etc).
  router.post('/agent-sweep', async (req, res, next) => {
    try {
      const body = runAgentSweepSchema.parse(req.body);
      const operatorIds = body.operatorIds ?? [];

      if (operatorIds.length === 0) {
        // In production, discover operators via a query against the operators collection
        res.json({ processed: 0, message: 'No operators specified' });
        return;
      }

      let totalLeads = 0;
      let executedCount = 0;
      let blockedCount = 0;
      let errorCount = 0;

      for (const rawOperatorId of operatorIds) {
        const operatorId = rawOperatorId as OperatorId;
        const leads = await deps.leadRepo.findActiveLeads(operatorId);
        totalLeads += leads.length;

        const results = await Promise.allSettled(
          leads.map((lead) => deps.agentService.evaluateLead(operatorId, lead.id, 'scheduled_sweep')),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            if (result.value.executed) executedCount += 1;
            else blockedCount += 1;
          } else {
            errorCount += 1;
          }
        }
      }

      deps.opsAlerts.dispatch({
        severity: errorCount > 0 ? 'warning' : 'info',
        title: 'Agent sweep complete',
        message: `Evaluated ${totalLeads} leads across ${operatorIds.length} operators`,
        metadata: { executed: executedCount, blocked: blockedCount, errors: errorCount },
      });

      res.json({
        operators: operatorIds.length,
        leadsEvaluated: totalLeads,
        executed: executedCount,
        blocked: blockedCount,
        errors: errorCount,
      });
    } catch (err) {
      next(err);
    }
  });

  // Warms the ONNX model cache for a set of operators — call this right
  // after a new revision deploys (or on a short interval) with your most
  // active operator IDs so their first scoring request doesn't pay the GCS
  // download cost inline. See ModelRegistryService for the caching strategy.
  router.post('/warm-model-cache', async (req, res, next) => {
    try {
      const body = req.body as { readonly operatorIds?: readonly string[] };
      const operatorIds = body.operatorIds ?? [];

      if (operatorIds.length === 0) {
        res.json({ warmed: 0, message: 'No operators specified' });
        return;
      }

      await deps.modelRegistry.warmUp(operatorIds);
      res.json({ warmed: operatorIds.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

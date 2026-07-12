import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { UnauthorizedError } from '../errors/app-errors.js';

import type { AgentService } from '../services/agent.service.js';
import type { Logger } from '@listinglogic/logger';
import type { OperatorId, LeadId } from '@listinglogic/types';

/**
 * Callback endpoints invoked by Cloud Tasks when scheduled work fires.
 *
 * Cloud Tasks uses OIDC bearer tokens signed by the queue's service account.
 * We verify the token via a shared secret here; production should use
 * `google-auth-library` to verify the OIDC token signature.
 */

export interface TaskCallbackDeps {
  readonly agentService: AgentService;
  readonly logger: Logger;
}

const TASK_SECRET_HEADER = 'x-task-secret';

/** Constant-time secret comparison — see scheduler.routes.ts for rationale. */
function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function createTaskCallbackRouter(deps: TaskCallbackDeps): Router {
  const router = Router();
  const secret = process.env.CLOUD_TASKS_SHARED_SECRET;

  router.use((req, _res, next) => {
    if (!secret) return next(new UnauthorizedError('Task callback not configured'));
    if (!secretsMatch(req.header(TASK_SECRET_HEADER), secret)) {
      deps.logger.warn('Task callback rejected', { ip: req.ip });
      return next(new UnauthorizedError('Invalid task secret'));
    }
    next();
  });

  // Fired by a delayed Cloud Task (e.g. a `schedule_follow_up` decision) to
  // re-run the Gemini agent against a lead at the scheduled follow-up time.
  router.post('/evaluate-lead', async (req, res, next) => {
    try {
      const body = req.body as {
        readonly operatorId: string;
        readonly leadId: string;
      };

      deps.logger.info('Executing scheduled agent evaluation', {
        operatorId: body.operatorId,
        leadId: body.leadId,
      });

      const decision = await deps.agentService.evaluateLead(
        body.operatorId as OperatorId,
        body.leadId as LeadId,
        'scheduled_sweep',
      );

      res.json({ received: true, action: decision.action.type, executed: decision.executed });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

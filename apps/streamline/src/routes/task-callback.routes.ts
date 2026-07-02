import type { Logger } from '@listinglogic/logger';
import { Router } from 'express';

import { UnauthorizedError } from '../errors/app-errors.js';
import type { AutomationService } from '../services/automation.service.js';

/**
 * Callback endpoints invoked by Cloud Tasks when scheduled work fires.
 *
 * Cloud Tasks uses OIDC bearer tokens signed by the queue's service account.
 * We verify the token via a shared secret here; production should use
 * `google-auth-library` to verify the OIDC token signature.
 */

export interface TaskCallbackDeps {
  readonly automationService: AutomationService;
  readonly logger: Logger;
}

const TASK_SECRET_HEADER = 'x-task-secret';

export function createTaskCallbackRouter(deps: TaskCallbackDeps): Router {
  const router = Router();
  const secret = process.env.CLOUD_TASKS_SHARED_SECRET;

  router.use((req, _res, next) => {
    if (!secret) return next(new UnauthorizedError('Task callback not configured'));
    if (req.header(TASK_SECRET_HEADER) !== secret) {
      deps.logger.warn('Task callback rejected', { ip: req.ip });
      return next(new UnauthorizedError('Invalid task secret'));
    }
    next();
  });

  router.post('/execute-automation-action', async (req, res, next) => {
    try {
      const body = req.body as {
        readonly operatorId: string;
        readonly automationId: string;
        readonly actionIndex: number;
        readonly leadId: string;
      };

      deps.logger.info('Executing scheduled automation action', {
        operatorId: body.operatorId,
        automationId: body.automationId,
        actionIndex: body.actionIndex,
      });

      // Wire this into automationService.executeSingleAction() in a follow-up.
      // For now, log and return 200 so Cloud Tasks doesn't retry.
      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

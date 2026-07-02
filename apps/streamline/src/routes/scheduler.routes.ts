import type { Logger } from '@listinglogic/logger';
import { Router } from 'express';

import { UnauthorizedError } from '../errors/app-errors.js';
import type { RetrainingService } from '../services/retraining.service.js';
import type { OpsAlertsService } from '../services/ops-alerts.service.js';

/**
 * Endpoints invoked by Cloud Scheduler for periodic jobs.
 *
 * Auth: OIDC token verification via header — Cloud Scheduler signs each request
 * with the service account. In this app we verify a shared secret header for
 * simplicity; upgrade to full OIDC verification via `google-auth-library` in prod.
 */

export interface SchedulerRouterDeps {
  readonly retrainingService: RetrainingService;
  readonly opsAlerts: OpsAlertsService;
  readonly logger: Logger;
}

const SCHEDULER_SECRET_HEADER = 'x-scheduler-secret';

export function createSchedulerRouter(deps: SchedulerRouterDeps): Router {
  const router = Router();
  const secret = process.env.SCHEDULER_SHARED_SECRET;

  // Guard middleware
  router.use((req, _res, next) => {
    if (!secret) {
      return next(new UnauthorizedError('Scheduler endpoints not configured'));
    }
    if (req.header(SCHEDULER_SECRET_HEADER) !== secret) {
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
        return res.json({ processed: 0, message: 'No operators specified' });
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

  // Stale lead sweep — dispatch automation triggers for leads not contacted in N days
  router.post('/stale-lead-sweep', async (req, res, next) => {
    try {
      const body = req.body as { readonly daysThreshold?: number };
      const threshold = body.daysThreshold ?? 14;
      // Actual sweep would iterate operators and call leadRepo.findStaleLeads
      res.json({ threshold, note: 'Stale sweep placeholder — wire per-operator iteration' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

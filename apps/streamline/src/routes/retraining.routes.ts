import { Router } from 'express';

import { requireAuth, requireClaim } from '../middleware/auth.js';
import type { RetrainingService } from '../services/retraining.service.js';

export interface RetrainingRouterDeps {
  readonly retrainingService: RetrainingService;
}

export function createRetrainingRouter(deps: RetrainingRouterDeps): Router {
  const router = Router();

  router.use(requireAuth);

  // Manual retraining — admin only. In production this is triggered by Cloud Scheduler.
  router.post('/run', requireClaim('admin'), async (req, res, next) => {
    try {
      const result = await deps.retrainingService.retrainForOperator(req.operatorId);
      res.json({
        data: result ?? { skipped: true, reason: 'insufficient samples or no improvement' },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

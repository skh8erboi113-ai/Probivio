import type { ProbateRepository } from '@listinglogic/db';
import type { ApiResponse, ProbateCase } from '@listinglogic/types';
import { scanProbatePdfSchema } from '@listinglogic/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { aiRateLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import type { ProbateService } from '../services/probate.service.js';

export interface ProbateRouterDeps {
  readonly probateRepo: ProbateRepository;
  readonly probateService: ProbateService;
}

export function createProbateRouter(deps: ProbateRouterDeps): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    '/scan',
    aiRateLimiter,
    validate({ body: scanProbatePdfSchema }),
    async (req, res, next) => {
      try {
        const payload = req.body as ReturnType<typeof scanProbatePdfSchema.parse>;

        const created =
          payload.type === 'base64'
            ? await deps.probateService.scanFromBase64(req.operatorId, payload.data, payload.filename)
            : await deps.probateService.scanFromUrl(req.operatorId, payload.url);

        const body: ApiResponse<ProbateCase> = {
          data: created,
          message: 'Probate case extracted',
          requestId: req.requestId,
        };
        res.status(201).json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/:id', async (req, res, next) => {
    try {
      const found = await deps.probateRepo.findByIdOrThrow(req.operatorId, req.params.id!);
      res.json({ data: found, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

import type { AutomationRepository } from '@listinglogic/db';
import type { ApiListResponse, ApiResponse, Automation } from '@listinglogic/types';
import {
  automationFiltersSchema,
  createAutomationSchema,
  updateAutomationSchema,
} from '@listinglogic/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export interface AutomationRouterDeps {
  readonly automationRepo: AutomationRepository;
}

export function createAutomationRouter(deps: AutomationRouterDeps): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', validate({ query: automationFiltersSchema }), async (req, res, next) => {
    try {
      const q = req.query as unknown as ReturnType<typeof automationFiltersSchema.parse>;
      const result = await deps.automationRepo.listWithFilters(req.operatorId, {
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        sortOrder: q.sortOrder,
        filters: {
          ...(q.isActive !== undefined && { isActive: q.isActive }),
          ...(q.trigger && { trigger: q.trigger as Automation['trigger'] }),
        },
      });

      const body: ApiListResponse<Automation> = {
        data: result.items,
        pagination: {
          total: result.total,
          page: q.page,
          limit: q.limit,
          hasMore: result.hasMore,
        },
        requestId: req.requestId,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const found = await deps.automationRepo.findByIdOrThrow(req.operatorId, req.params.id!);
      const body: ApiResponse<Automation> = { data: found, requestId: req.requestId };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validate({ body: createAutomationSchema }), async (req, res, next) => {
    try {
      const created = await deps.automationRepo.create(req.operatorId, {
        ...req.body,
        runCount: 0,
        successCount: 0,
        failureCount: 0,
      });
      res.status(201).json({ data: created, message: 'Automation created', requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', validate({ body: updateAutomationSchema }), async (req, res, next) => {
    try {
      const updated = await deps.automationRepo.update(req.operatorId, req.params.id!, req.body);
      res.json({ data: updated, message: 'Automation updated', requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await deps.automationRepo.delete(req.operatorId, req.params.id!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

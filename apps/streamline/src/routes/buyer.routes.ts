import type { BuyerRepository } from '@listinglogic/db';
import type { ApiListResponse, ApiResponse, Buyer, LeadId } from '@listinglogic/types';
import {
  buyerFiltersSchema,
  createBuyerSchema,
  matchBuyersRequestSchema,
  updateBuyerSchema,
} from '@listinglogic/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { aiRateLimiter } from '../middleware/rate-limit.js';
import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import { validate } from '../middleware/validate.js';
import type { BuyerMatchingService } from '../services/buyer-matching.service.js';

export interface BuyerRouterDeps {
  readonly buyerRepo: BuyerRepository;
  readonly buyerMatching: BuyerMatchingService;
  readonly eventPublisher: EventPublisherService;
}

export function createBuyerRouter(deps: BuyerRouterDeps): Router {
  const router = Router();

  router.use(requireAuth);

  router.get('/', validate({ query: buyerFiltersSchema }), async (req, res, next) => {
    try {
      const q = req.query as unknown as ReturnType<typeof buyerFiltersSchema.parse>;
      const result = await deps.buyerRepo.listWithFilters(req.operatorId, {
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        sortOrder: q.sortOrder,
        filters: {
          ...(q.type && { type: q.type }),
          ...(q.status && { status: q.status }),
          ...(q.state && { state: q.state }),
          ...(q.search && { search: q.search }),
        },
      });

      const body: ApiListResponse<Buyer> = {
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

  router.get('/match', aiRateLimiter, validate({ query: matchBuyersRequestSchema }), async (req, res, next) => {
    try {
      const q = req.query as unknown as ReturnType<typeof matchBuyersRequestSchema.parse>;
      const matches = await deps.buyerMatching.match(req.operatorId, q.leadId as LeadId, {
        limit: q.limit,
        minMatchScore: q.minMatchScore,
      });

      res.json({
        data: matches,
        pagination: { total: matches.length, page: 1, limit: matches.length, hasMore: false },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const buyer = await deps.buyerRepo.findByIdOrThrow(req.operatorId, req.params.id!);
      const body: ApiResponse<Buyer> = { data: buyer, requestId: req.requestId };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validate({ body: createBuyerSchema }), async (req, res, next) => {
    try {
      const stats = {
        activeDeals: 0,
        totalDealsClosed: 0,
        averageCloseTime: 0,
        totalVolume: 0 as never,
        rejectionRate: 0,
      };
      const created = await deps.buyerRepo.create(req.operatorId, { ...req.body, stats });

      deps.eventPublisher.publish('buyer.created', req.operatorId, {
        buyerId: created.id,
        name: `${created.firstName} ${created.lastName}`,
        company: created.company,
      });

      res.status(201).json({ data: created, message: 'Buyer created', requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', validate({ body: updateBuyerSchema }), async (req, res, next) => {
    try {
      const updated = await deps.buyerRepo.update(req.operatorId, req.params.id!, req.body);

      deps.eventPublisher.publish('buyer.updated', req.operatorId, {
        buyerId: updated.id,
        changedFields: Object.keys(req.body),
      });

      res.json({ data: updated, message: 'Buyer updated', requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await deps.buyerRepo.delete(req.operatorId, req.params.id!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
  }

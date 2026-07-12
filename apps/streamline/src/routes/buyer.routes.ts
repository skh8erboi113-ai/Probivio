import {
  buyerFiltersSchema,
  createBuyerSchema,
  matchBuyersRequestSchema,
  updateBuyerSchema,
  type CreateBuyerPayload,
  type UpdateBuyerPayload,
} from '@listinglogic/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { aiRateLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { stripUndefined } from '../utils/strip-undefined.js';

import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import type { BuyerMatchingService } from '../services/buyer-matching.service.js';
import type { BuyerRepository } from '@listinglogic/db';
import type { ApiListResponse, ApiResponse, Buyer, LeadId, UsStateCode } from '@listinglogic/types';

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
        ...(q.cursor && { cursor: q.cursor }),
        limit: q.limit,
        sortBy: q.sortBy,
        sortOrder: q.sortOrder,
        filters: {
          ...(q.type && { type: q.type }),
          ...(q.status && { status: q.status }),
          ...(q.state && { state: q.state as UsStateCode }),
          ...(q.search && { search: q.search }),
        },
      });

      const body: ApiListResponse<Buyer> = {
        data: result.items,
        pagination: {
          total: result.total,
          limit: q.limit,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
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
        pagination: { total: matches.length, limit: matches.length, hasMore: false, nextCursor: null },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const buyer = await deps.buyerRepo.findByIdOrThrow(req.operatorId, String(req.params.id));
      const body: ApiResponse<Buyer> = { data: buyer, requestId: req.requestId };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validate({ body: createBuyerSchema }), async (req, res, next) => {
    try {
      const body = req.body as CreateBuyerPayload;
      const stats = {
        activeDeals: 0,
        totalDealsClosed: 0,
        averageCloseTime: 0,
        totalVolume: 0 as never,
        rejectionRate: 0,
      };
      const created = await deps.buyerRepo.create(
        req.operatorId,
        { ...stripUndefined(body), stats } as unknown as Omit<Buyer, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>,
      );

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
      const body = req.body as UpdateBuyerPayload;
      const updated = await deps.buyerRepo.update(
        req.operatorId,
        String(req.params.id),
        stripUndefined(body) as unknown as Partial<Omit<Buyer, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>>,
      );

      deps.eventPublisher.publish('buyer.updated', req.operatorId, {
        buyerId: updated.id,
        changedFields: Object.keys(body),
      });

      res.json({ data: updated, message: 'Buyer updated', requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await deps.buyerRepo.delete(req.operatorId, String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
  }

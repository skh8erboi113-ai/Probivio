import type { LeadRepository } from '@listinglogic/db';
import type {
  ApiListResponse,
  ApiResponse,
  Lead,
  LeadId,
  OperatorId,
} from '@listinglogic/types';
import {
  createLeadSchema,
  leadFiltersSchema,
  updateLeadSchema,
} from '@listinglogic/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import { validate } from '../middleware/validate.js';
import type { ScoringService } from '../services/scoring.service.js';

export interface LeadRouterDeps {
  readonly leadRepo: LeadRepository;
  readonly scoringService: ScoringService;
  readonly eventPublisher: EventPublisherService;
}

export function createLeadRouter(deps: LeadRouterDeps): Router {
  const router = Router();

  router.use(requireAuth);

  router.get('/', validate({ query: leadFiltersSchema }), async (req, res, next) => {
    try {
      const q = req.query as unknown as ReturnType<typeof leadFiltersSchema.parse>;
      const result = await deps.leadRepo.listWithFilters(req.operatorId, {
        page: q.page,
        limit: q.limit,
        sortBy: q.sortBy,
        sortOrder: q.sortOrder,
        filters: {
          ...(q.status && { status: q.status }),
          ...(q.source && { source: q.source }),
          ...(q.motivation && { motivation: q.motivation }),
          ...(q.minScore !== undefined && { minScore: q.minScore }),
          ...(q.maxScore !== undefined && { maxScore: q.maxScore }),
          ...(q.assignedTo && { assignedTo: q.assignedTo as OperatorId }),
          ...(q.search && { search: q.search }),
          ...(q.tag && { tags: [q.tag] }),
        },
      });

      const body: ApiListResponse<Lead> = {
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

  router.get('/dashboard/hot', async (req, res, next) => {
    try {
      const leads = await deps.leadRepo.findHotLeads(req.operatorId);
      res.json({
        data: leads,
        pagination: { total: leads.length, page: 1, limit: leads.length, hasMore: false },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const lead = await deps.leadRepo.findByIdOrThrow(req.operatorId, req.params.id!);
      const body: ApiResponse<Lead> = { data: lead, requestId: req.requestId };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validate({ body: createLeadSchema }), async (req, res, next) => {
    try {
      const created = await deps.leadRepo.create(req.operatorId, req.body);

      deps.eventPublisher.publish('lead.created', req.operatorId, {
        leadId: created.id,
        contactName: `${created.contact.firstName} ${created.contact.lastName}`,
        source: created.source,
      });

      void deps.scoringService.scoreLead(req.operatorId, created.id, 'creation').catch(() => undefined);

      const body: ApiResponse<Lead> = {
        data: created,
        message: 'Lead created',
        requestId: req.requestId,
      };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', validate({ body: updateLeadSchema }), async (req, res, next) => {
    try {
      const updated = await deps.leadRepo.update(req.operatorId, req.params.id!, req.body);

      deps.eventPublisher.publish('lead.updated', req.operatorId, {
        leadId: updated.id,
        changedFields: Object.keys(req.body),
      });

      const body: ApiResponse<Lead> = {
        data: updated,
        message: 'Lead updated',
        requestId: req.requestId,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await deps.leadRepo.delete(req.operatorId, req.params.id!);

      deps.eventPublisher.publish('lead.deleted', req.operatorId, {
        leadId: req.params.id!,
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/score', async (req, res, next) => {
    try {
      const score = await deps.scoringService.scoreLead(
        req.operatorId,
        req.params.id! as LeadId,
        'manual',
      );
      res.json({ data: score, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

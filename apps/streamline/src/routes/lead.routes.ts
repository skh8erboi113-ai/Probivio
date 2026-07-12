import {
  createLeadSchema,
  leadFiltersSchema,
  updateLeadSchema,
  type CreateLeadPayload,
  type UpdateLeadPayload,
} from '@listinglogic/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { stripUndefined } from '../utils/strip-undefined.js';

import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import type { AgentService } from '../services/agent.service.js';
import type { ScoringService } from '../services/scoring.service.js';
import type { LeadRepository } from '@listinglogic/db';
import type {
  ApiListResponse,
  ApiResponse,
  Lead,
  LeadId,
  OperatorId,
} from '@listinglogic/types';

export interface LeadRouterDeps {
  readonly leadRepo: LeadRepository;
  readonly scoringService: ScoringService;
  readonly agentService: AgentService;
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
      const lead = await deps.leadRepo.findByIdOrThrow(req.operatorId, String(req.params.id));
      const body: ApiResponse<Lead> = { data: lead, requestId: req.requestId };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validate({ body: createLeadSchema }), async (req, res, next) => {
    try {
      const payload = req.body as CreateLeadPayload;
      const created = await deps.leadRepo.create(
        req.operatorId,
        stripUndefined(payload) as unknown as Omit<Lead, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>,
      );

      deps.eventPublisher.publish('lead.created', req.operatorId, {
        leadId: created.id,
        contactName: `${created.contact.firstName} ${created.contact.lastName}`,
        source: created.source,
      });

      void deps.scoringService.scoreLead(req.operatorId, created.id, 'creation').catch(() => undefined);
      void deps.agentService.evaluateLead(req.operatorId, created.id, 'lead_created').catch(() => undefined);

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
      const payload = req.body as UpdateLeadPayload;
      const updated = await deps.leadRepo.update(
        req.operatorId,
        String(req.params.id),
        stripUndefined(payload) as unknown as Partial<Omit<Lead, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>>,
      );

      deps.eventPublisher.publish('lead.updated', req.operatorId, {
        leadId: updated.id,
        changedFields: Object.keys(payload),
      });

      if (payload.status !== undefined) {
        void deps.agentService
          .evaluateLead(req.operatorId, updated.id, 'lead_status_changed')
          .catch(() => undefined);
      }

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
      await deps.leadRepo.delete(req.operatorId, String(req.params.id));

      deps.eventPublisher.publish('lead.deleted', req.operatorId, {
        leadId: String(req.params.id),
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/score', async (req, res, next) => {
    try {
      const leadId = String(req.params.id) as LeadId;
      const score = await deps.scoringService.scoreLead(req.operatorId, leadId, 'manual');

      void deps.agentService.evaluateLead(req.operatorId, leadId, 'lead_scored').catch(() => undefined);

      res.json({ data: score, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

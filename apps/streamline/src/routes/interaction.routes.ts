import { createInteractionSchema, type CreateInteractionPayload } from '@probivio/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { stripUndefined } from '../utils/strip-undefined.js';

import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import type { AgentService } from '../services/agent.service.js';
import type { ScoringService } from '../services/scoring.service.js';
import type { InteractionRepository } from '@probivio/db';
import type { CreateInteractionInput, LeadId } from '@probivio/types';

export interface InteractionRouterDeps {
  readonly interactionRepo: InteractionRepository;
  readonly scoringService: ScoringService;
  readonly agentService: AgentService;
  readonly eventPublisher: EventPublisherService;
}

export function createInteractionRouter(deps: InteractionRouterDeps): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', validate({ body: createInteractionSchema }), async (req, res, next) => {
    try {
      const body = req.body as CreateInteractionPayload;
      const created = await deps.interactionRepo.record(
        req.operatorId,
        stripUndefined(body) as unknown as CreateInteractionInput,
      );

      deps.eventPublisher.publish('interaction.recorded', req.operatorId, {
        interactionId: created.id,
        leadId: created.leadId,
        type: created.type,
        outcome: created.outcome,
      });

      void deps.scoringService
        .scoreLead(req.operatorId, created.leadId, 'interaction')
        .catch(() => undefined);

      void deps.agentService
        .evaluateLead(req.operatorId, created.leadId, 'interaction_recorded')
        .catch(() => undefined);

      res.status(201).json({ data: created, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/lead/:leadId', async (req, res, next) => {
    try {
      const interactions = await deps.interactionRepo.findByLead(
        req.operatorId,
        req.params.leadId as LeadId,
      );
      res.json({
        data: interactions,
        pagination: { total: interactions.length, limit: interactions.length, hasMore: false, nextCursor: null },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

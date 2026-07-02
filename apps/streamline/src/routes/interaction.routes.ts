import type { InteractionRepository } from '@listinglogic/db';
import type { AutomationTrigger, LeadId } from '@listinglogic/types';
import { createInteractionSchema } from '@listinglogic/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import { validate } from '../middleware/validate.js';
import type { AutomationService } from '../services/automation.service.js';
import type { ScoringService } from '../services/scoring.service.js';

export interface InteractionRouterDeps {
  readonly interactionRepo: InteractionRepository;
  readonly scoringService: ScoringService;
  readonly automationService: AutomationService;
  readonly eventPublisher: EventPublisherService;
}

export function createInteractionRouter(deps: InteractionRouterDeps): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', validate({ body: createInteractionSchema }), async (req, res, next) => {
    try {
      const created = await deps.interactionRepo.record(req.operatorId, req.body);

      deps.eventPublisher.publish('interaction.recorded', req.operatorId, {
        interactionId: created.id,
        leadId: created.leadId,
        type: created.type,
        outcome: created.outcome,
      });

      void deps.scoringService
        .scoreLead(req.operatorId, created.leadId, 'interaction')
        .catch(() => undefined);

      void deps.automationService
        .trigger(req.operatorId, 'lead_scored' as AutomationTrigger, { leadId: created.leadId })
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
        req.params.leadId! as LeadId,
      );
      res.json({
        data: interactions,
        pagination: { total: interactions.length, page: 1, limit: interactions.length, hasMore: false },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

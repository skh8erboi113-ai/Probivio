import { agentDecisionLogFiltersSchema } from '@listinglogic/validators';
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { aiRateLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';

import type { AgentService } from '../services/agent.service.js';
import type { AgentDecisionLogRepository } from '@listinglogic/db';
import type { AgentDecisionLog, ApiListResponse, ApiResponse, LeadId } from '@listinglogic/types';


export interface AgentRouterDeps {
  readonly decisionLogRepo: AgentDecisionLogRepository;
  readonly agentService: AgentService;
}

/**
 * Read-only audit trail of the Gemini automation agent's decisions, plus a
 * manual "evaluate this lead now" trigger for operators who don't want to
 * wait for the next scheduled sweep.
 */
export function createAgentRouter(deps: AgentRouterDeps): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/decisions', validate({ query: agentDecisionLogFiltersSchema }), async (req, res, next) => {
    try {
      const q = req.query as unknown as ReturnType<typeof agentDecisionLogFiltersSchema.parse>;
      const result = await deps.decisionLogRepo.listWithFilters(req.operatorId, {
        ...(q.cursor && { cursor: q.cursor }),
        limit: q.limit,
        sortBy: q.sortBy,
        sortOrder: q.sortOrder,
        filters: {
          ...(q.leadId && { leadId: q.leadId as LeadId }),
          ...(q.executed !== undefined && { executed: q.executed }),
          ...(q.trigger && { trigger: q.trigger }),
        },
      });

      const body: ApiListResponse<AgentDecisionLog> = {
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

  router.get('/decisions/lead/:leadId', async (req, res, next) => {
    try {
      const result = await deps.decisionLogRepo.listWithFilters(req.operatorId, {
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        filters: { leadId: req.params.leadId as LeadId },
      });

      res.json({
        data: result.items,
        pagination: { total: result.total, limit: 50, hasMore: result.hasMore, nextCursor: result.nextCursor },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  });

  // Manual "evaluate now" — lets an operator force a Gemini decision cycle
  // for one lead instead of waiting for the next event or scheduled sweep.
  router.post('/evaluate/:leadId', aiRateLimiter, async (req, res, next) => {
    try {
      const decision = await deps.agentService.evaluateLead(
        req.operatorId,
        req.params.leadId as LeadId,
        'manual',
      );
      const body: ApiResponse<AgentDecisionLog> = { data: decision, requestId: req.requestId };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

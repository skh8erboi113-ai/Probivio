import type { AgentDecisionLog, ApiListResponse, ApiResponse } from '@listinglogic/types';
import type { AgentDecisionLogFiltersPayload } from '@listinglogic/validators';

import { api } from './client';

export interface ListAgentDecisionsParams extends Partial<AgentDecisionLogFiltersPayload> {}

export const agentApi = {
  listDecisions(params: ListAgentDecisionsParams = {}) {
    return api.get<ApiListResponse<AgentDecisionLog>>('/api/agent/decisions', params as Record<string, unknown>);
  },

  listDecisionsForLead(leadId: string) {
    return api.get<ApiListResponse<AgentDecisionLog>>(`/api/agent/decisions/lead/${leadId}`);
  },

  evaluateNow(leadId: string) {
    return api.post<ApiResponse<AgentDecisionLog>>(`/api/agent/evaluate/${leadId}`, {});
  },
};

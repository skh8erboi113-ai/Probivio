import type { AgentDecisionLog, ApiListResponse, ApiResponse, OperatorAgentSettings } from '@probivio/types';
import type { AgentDecisionLogFiltersPayload, UpdateOperatorAgentSettingsPayload } from '@probivio/validators';

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

  getSettings() {
    return api.get<ApiResponse<OperatorAgentSettings>>('/api/agent/settings');
  },

  updateSettings(input: UpdateOperatorAgentSettingsPayload) {
    return api.patch<ApiResponse<OperatorAgentSettings>>('/api/agent/settings', input);
  },

  resolveDecision(decisionId: string, approve: boolean) {
    return api.post<ApiResponse<AgentDecisionLog>>(`/api/agent/decisions/${decisionId}/resolve`, { approve });
  },
};


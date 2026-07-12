import type { AgentDecisionLogFiltersPayload } from '@listinglogic/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { agentApi } from '../api/agent.api';
import { leadKeys } from './useLeads';

const KEY = ['agent', 'decisions'] as const;

export function useAgentDecisions(filters: Partial<AgentDecisionLogFiltersPayload> = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () => agentApi.listDecisions(filters),
    staleTime: 30_000,
  });
}

export function useLeadAgentDecisions(leadId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'lead', leadId],
    queryFn: () => agentApi.listDecisionsForLead(leadId as string),
    enabled: Boolean(leadId),
    staleTime: 30_000,
  });
}

export function useEvaluateLeadNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => agentApi.evaluateNow(leadId),
    onSuccess: (_data, leadId) => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: leadKeys.detail(leadId) });
    },
  });
}

import type { AgentDecisionLogFiltersPayload, UpdateOperatorAgentSettingsPayload } from '@probivio/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { agentApi } from '../api/agent.api';
import { leadKeys } from './useLeads';

const KEY = ['agent', 'decisions'] as const;
const SETTINGS_KEY = ['agent', 'settings'] as const;

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

/** Confidence-gated autonomy dial — read the operator's current threshold and email policy. */
export function useAgentSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => agentApi.getSettings(),
    staleTime: 30_000,
  });
}

export function useUpdateAgentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOperatorAgentSettingsPayload) => agentApi.updateSettings(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

/** One-tap approve/reject for a decision drafted below the autonomy threshold. */
export function useResolveAgentDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ decisionId, approve }: { readonly decisionId: string; readonly approve: boolean }) =>
      agentApi.resolveDecision(decisionId, approve),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

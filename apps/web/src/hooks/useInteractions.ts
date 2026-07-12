import type { CreateInteractionPayload } from '@probivio/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { interactionsApi } from '../api/interactions.api';
import { leadKeys } from './useLeads';

export const interactionKeys = {
  all: ['interactions'] as const,
  forLead: (leadId: string) => [...interactionKeys.all, 'lead', leadId] as const,
};

export function useLeadInteractions(leadId: string | undefined) {
  return useQuery({
    queryKey: leadId ? interactionKeys.forLead(leadId) : ['interactions', 'lead', 'null'],
    queryFn: () => interactionsApi.forLead(leadId!),
    enabled: Boolean(leadId),
    staleTime: 30_000,
  });
}

export function useRecordInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInteractionPayload) => interactionsApi.record(input),
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: interactionKeys.forLead(input.leadId) });
      void qc.invalidateQueries({ queryKey: leadKeys.detail(input.leadId) });
      void qc.invalidateQueries({ queryKey: leadKeys.hot() });
    },
  });
}

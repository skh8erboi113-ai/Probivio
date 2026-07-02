import type {
  AutomationFiltersPayload,
  CreateAutomationPayload,
  UpdateAutomationPayload,
} from '@listinglogic/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { automationsApi } from '../api/automations.api';

export const automationKeys = {
  all: ['automations'] as const,
  list: (params: Partial<AutomationFiltersPayload>) => [...automationKeys.all, 'list', params] as const,
  detail: (id: string) => [...automationKeys.all, 'detail', id] as const,
};

export function useAutomations(params: Partial<AutomationFiltersPayload> = {}) {
  return useQuery({
    queryKey: automationKeys.list(params),
    queryFn: () => automationsApi.list(params),
    staleTime: 60_000,
  });
}

export function useAutomation(id: string | undefined) {
  return useQuery({
    queryKey: id ? automationKeys.detail(id) : ['automations', 'detail', 'null'],
    queryFn: () => automationsApi.getById(id!),
    enabled: Boolean(id),
  });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAutomationPayload) => automationsApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { readonly id: string; readonly input: UpdateAutomationPayload }) =>
      automationsApi.update(id, input),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: automationKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationsApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

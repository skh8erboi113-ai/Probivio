import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { automationsApi, type AutomationFilters } from '../api/automations.api';

const KEY = ['automations'] as const;

export function useAutomations(filters: AutomationFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () => automationsApi.list(filters),
    staleTime: 60_000,
  });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => automationsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: unknown }) => automationsApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

import type {
  BuyerFiltersPayload,
  CreateBuyerPayload,
  UpdateBuyerPayload,
} from '@probivio/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { buyersApi } from '../api/buyers.api';

export const buyerKeys = {
  all: ['buyers'] as const,
  lists: () => [...buyerKeys.all, 'list'] as const,
  list: (params: Partial<BuyerFiltersPayload>) => [...buyerKeys.all, 'list', params] as const,
  detail: (id: string) => [...buyerKeys.all, 'detail', id] as const,
  matches: (leadId: string) => [...buyerKeys.all, 'match', leadId] as const,
};

export function useBuyers(params: Partial<BuyerFiltersPayload> = {}) {
  return useQuery({
    queryKey: buyerKeys.list(params),
    queryFn: () => buyersApi.list(params),
    staleTime: 30_000,
  });
}

export function useBuyer(id: string | undefined) {
  return useQuery({
    queryKey: id ? buyerKeys.detail(id) : ['buyers', 'detail', 'null'],
    queryFn: () => buyersApi.getById(id!),
    enabled: Boolean(id),
  });
}

export function useBuyerMatches(leadId: string | undefined) {
  return useQuery({
    queryKey: leadId ? buyerKeys.matches(leadId) : ['buyers', 'match', 'null'],
    queryFn: () => buyersApi.match(leadId!),
    enabled: Boolean(leadId),
    staleTime: 5 * 60_000,
  });
}

export function useCreateBuyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBuyerPayload) => buyersApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: buyerKeys.lists() });
    },
  });
}

export function useUpdateBuyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { readonly id: string; readonly input: UpdateBuyerPayload }) =>
      buyersApi.update(id, input),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: buyerKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: buyerKeys.lists() });
    },
  });
}

export function useDeleteBuyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => buyersApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: buyerKeys.all });
    },
  });
}

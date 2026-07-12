import type { Lead } from '@listinglogic/types';
import type { CreateLeadPayload, UpdateLeadPayload } from '@listinglogic/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiClientError } from '../api/client';
import { leadsApi, type ListLeadsParams } from '../api/leads.api';

const LEADS_KEY = ['leads'] as const;

export const leadKeys = {
  all: LEADS_KEY,
  lists: () => [...LEADS_KEY, 'list'] as const,
  list: (params: ListLeadsParams) => [...LEADS_KEY, 'list', params] as const,
  details: () => [...LEADS_KEY, 'detail'] as const,
  detail: (id: string) => [...LEADS_KEY, 'detail', id] as const,
  hot: () => [...LEADS_KEY, 'hot'] as const,
};

export function useLeads(params: ListLeadsParams = {}) {
  return useQuery({
    queryKey: leadKeys.list(params),
    queryFn: () => leadsApi.list(params),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: id ? leadKeys.detail(id) : ['leads', 'detail', 'null'],
    queryFn: () => leadsApi.getById(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useHotLeads() {
  return useQuery({
    queryKey: leadKeys.hot(),
    queryFn: () => leadsApi.hot(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadPayload) => leadsApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leadKeys.lists() });
      void qc.invalidateQueries({ queryKey: leadKeys.hot() });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { readonly id: string; readonly input: UpdateLeadPayload }) =>
      leadsApi.update(id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: leadKeys.detail(id) });
      const previous = qc.getQueryData<{ readonly data: Lead }>(leadKeys.detail(id));
      if (previous) {
        qc.setQueryData(leadKeys.detail(id), {
          ...previous,
          data: { ...previous.data, ...input },
        });
      }
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous) qc.setQueryData(leadKeys.detail(id), ctx.previous);
    },
    onSettled: (_data, _err, { id }) => {
      void qc.invalidateQueries({ queryKey: leadKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: leadKeys.lists() });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadsApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

export function useScoreLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadsApi.score(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: leadKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: leadKeys.lists() });
      void qc.invalidateQueries({ queryKey: leadKeys.hot() });
    },
  });
}

export function useSkipTrace() {
  return useMutation({
    mutationFn: (id: string) => leadsApi.skipTrace(id),
  });
}

export function useScoreExplanation(id: string | undefined, lookbackDays = 30) {
  return useQuery({
    queryKey: id ? [...leadKeys.detail(id), 'score-explanation', lookbackDays] : ['leads', 'score-explanation', 'null'],
    queryFn: () => leadsApi.scoreExplanation(id!, lookbackDays),
    enabled: Boolean(id),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      // 404 means "no score history yet" — not worth retrying.
      if (error instanceof ApiClientError && error.isNotFound) return false;
      return failureCount < 2;
    },
  });
}

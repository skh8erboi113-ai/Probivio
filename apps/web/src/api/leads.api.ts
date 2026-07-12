import type {
  ApiListResponse,
  ApiResponse,
  Lead,
  LeadFilters,
  ScoreDrillDown,
  ScoreResult,
  SkipTraceResult,
} from '@listinglogic/types';
import type { CreateLeadPayload, UpdateLeadPayload } from '@listinglogic/validators';

import { api } from './client';

export interface ListLeadsParams extends LeadFilters {
  readonly cursor?: string;
  readonly limit?: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
}

export const leadsApi = {
  list(params: ListLeadsParams = {}) {
    return api.get<ApiListResponse<Lead>>('/api/leads', params as Record<string, unknown>);
  },

  getById(id: string) {
    return api.get<ApiResponse<Lead>>(`/api/leads/${id}`);
  },

  create(input: CreateLeadPayload) {
    return api.post<ApiResponse<Lead>>('/api/leads', input);
  },

  update(id: string, input: UpdateLeadPayload) {
    return api.patch<ApiResponse<Lead>>(`/api/leads/${id}`, input);
  },

  delete(id: string) {
    return api.delete(`/api/leads/${id}`);
  },

  score(id: string) {
    return api.post<ApiResponse<ScoreResult>>(`/api/leads/${id}/score`, {});
  },

  hot() {
    return api.get<ApiListResponse<Lead>>('/api/leads/dashboard/hot');
  },

  skipTrace(id: string) {
    return api.post<ApiResponse<SkipTraceResult>>(`/api/leads/${id}/skip-trace`, {});
  },

  scoreExplanation(id: string, lookbackDays = 30) {
    return api.get<ApiResponse<ScoreDrillDown>>(`/api/leads/${id}/score-explanation`, { lookbackDays });
  },
};

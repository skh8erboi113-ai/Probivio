import type {
  ApiListResponse,
  ApiResponse,
  Buyer,
  BuyerMatch,
} from '@listinglogic/types';
import type {
  BuyerFiltersPayload,
  CreateBuyerPayload,
  UpdateBuyerPayload,
} from '@listinglogic/validators';

import { api } from './client';

export const buyersApi = {
  list(params: Partial<BuyerFiltersPayload> = {}) {
    return api.get<ApiListResponse<Buyer>>('/api/buyers', params as Record<string, unknown>);
  },

  getById(id: string) {
    return api.get<ApiResponse<Buyer>>(`/api/buyers/${id}`);
  },

  create(input: CreateBuyerPayload) {
    return api.post<ApiResponse<Buyer>>('/api/buyers', input);
  },

  update(id: string, input: UpdateBuyerPayload) {
    return api.patch<ApiResponse<Buyer>>(`/api/buyers/${id}`, input);
  },

  delete(id: string) {
    return api.delete(`/api/buyers/${id}`);
  },

  match(leadId: string, options: { readonly limit?: number; readonly minMatchScore?: number } = {}) {
    return api.get<ApiListResponse<BuyerMatch>>('/api/buyers/match', {
      leadId,
      limit: options.limit ?? 10,
      minMatchScore: options.minMatchScore ?? 60,
    });
  },
};

import type { ApiListResponse, ApiResponse, Automation } from '@listinglogic/types';
import type {
  AutomationFiltersPayload,
  CreateAutomationPayload,
  UpdateAutomationPayload,
} from '@listinglogic/validators';

import { api } from './client';

export const automationsApi = {
  list(params: Partial<AutomationFiltersPayload> = {}) {
    return api.get<ApiListResponse<Automation>>('/api/automations', params as Record<string, unknown>);
  },

  getById(id: string) {
    return api.get<ApiResponse<Automation>>(`/api/automations/${id}`);
  },

  create(input: CreateAutomationPayload) {
    return api.post<ApiResponse<Automation>>('/api/automations', input);
  },

  update(id: string, input: UpdateAutomationPayload) {
    return api.patch<ApiResponse<Automation>>(`/api/automations/${id}`, input);
  },

  delete(id: string) {
    return api.delete(`/api/automations/${id}`);
  },
};

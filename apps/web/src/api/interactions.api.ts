import type { ApiListResponse, ApiResponse, Interaction } from '@probivio/types';
import type { CreateInteractionPayload } from '@probivio/validators';

import { api } from './client';

export const interactionsApi = {
  record(input: CreateInteractionPayload) {
    return api.post<ApiResponse<Interaction>>('/api/interactions', input);
  },

  forLead(leadId: string) {
    return api.get<ApiListResponse<Interaction>>(`/api/interactions/lead/${leadId}`);
  },
};

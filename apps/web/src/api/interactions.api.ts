import type { ApiListResponse, ApiResponse, Interaction } from '@listinglogic/types';
import type { CreateInteractionPayload } from '@listinglogic/validators';

import { api } from './client';

export const interactionsApi = {
  record(input: CreateInteractionPayload) {
    return api.post<ApiResponse<Interaction>>('/api/interactions', input);
  },

  forLead(leadId: string) {
    return api.get<ApiListResponse<Interaction>>(`/api/interactions/lead/${leadId}`);
  },
};

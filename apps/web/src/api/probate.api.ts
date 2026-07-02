import type { ApiResponse, ProbateCase } from '@listinglogic/types';
import type { ScanProbatePdfPayload } from '@listinglogic/validators';

import { api } from './client';

export const probateApi = {
  scan(input: ScanProbatePdfPayload) {
    return api.post<ApiResponse<ProbateCase>>('/api/probate/scan', input);
  },

  getById(id: string) {
    return api.get<ApiResponse<ProbateCase>>(`/api/probate/${id}`);
  },
};

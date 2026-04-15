import { apiClient } from './client';
import { ApiResponse, PaginatedResponse } from '../types/api';
import { Request, RequestType } from '../types/request';

export interface CreateRequestPayload {
  type: RequestType;
  amount: number;
  reason: string;
}

export const requestsApi = {
  list: (page = 1, limit = 10) =>
    apiClient.get<ApiResponse<PaginatedResponse<Request>>>(
      `/requests?page=${page}&limit=${limit}`,
    ),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Request>>(`/requests/${id}`),

  create: (data: CreateRequestPayload) =>
    apiClient.post<ApiResponse<Request>>('/requests', data),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<Request>>(`/requests/${id}/cancel`, {}),
};

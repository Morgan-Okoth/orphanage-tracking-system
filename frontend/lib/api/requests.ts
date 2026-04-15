import { apiClient } from './client';
import { ApiResponse, PaginatedResponse } from '../types/api';
import { Request, RequestType } from '../types/request';
import { API_BASE_URL } from '../utils/constants';

export interface CreateRequestPayload {
  type: RequestType;
  amount: number;
  reason: string;
}

function buildCreateRequestFormData(
  data: CreateRequestPayload,
  files: File[],
): FormData {
  const formData = new FormData();
  formData.append('type', data.type);
  formData.append('amount', data.amount.toString());
  formData.append('reason', data.reason);

  files.forEach((file, index) => {
    formData.append(`document${index + 1}`, file);
  });

  return formData;
}

export const requestsApi = {
  list: (page = 1, limit = 10) =>
    apiClient.get<ApiResponse<PaginatedResponse<Request>>>(
      `/requests?page=${page}&limit=${limit}`,
    ),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Request>>(`/requests/${id}`),

  create: async (data: CreateRequestPayload, files: File[]) => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const res = await fetch(`${API_BASE_URL}/requests`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: buildCreateRequestFormData(data, files),
    });
    const json = await res.json();

    if (!res.ok) {
      throw new Error(json?.error?.message ?? 'Failed to create request');
    }

    return json as ApiResponse<Request>;
  },

  cancel: (id: string) =>
    apiClient.delete<ApiResponse<Request>>(`/requests/${id}`),
};

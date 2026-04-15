import { apiClient } from './client';
import { ApiResponse, PaginatedResponse } from '../types/api';
import { Request, RequestStatus } from '../types/request';

export interface PendingAction {
  requestId: string;
  type: string;
  studentName?: string;
  amount: number;
  submittedAt: string;
  actionRequired: string;
}

export interface DashboardStats {
  requestsByStatus: Record<RequestStatus, number>;
  totalDisbursedThisMonth: number;
  pendingReviewCount: number;
  totalRequests: number;
  pendingActions?: PendingAction[];
}

export interface Comment {
  id: string;
  requestId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  createdAt: string;
  isInternal: boolean;
}

export interface AdminRequestFilters {
  status?: RequestStatus;
  page?: number;
  limit?: number;
}

export interface StatusChange {
  id: string;
  requestId: string;
  fromStatus: string | null;
  toStatus: string;
  changedById: string;
  changedByName: string;
  changedAt: string;
  reason?: string;
}

export const adminApi = {
  getDashboardStats: () =>
    apiClient.get<ApiResponse<DashboardStats>>('/admin/dashboard'),

  listRequests: (filters: AdminRequestFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    params.set('page', String(filters.page ?? 1));
    params.set('limit', String(filters.limit ?? 20));
    return apiClient.get<ApiResponse<PaginatedResponse<Request>>>(
      `/admin/requests?${params.toString()}`,
    );
  },

  getRequest: (id: string) =>
    apiClient.get<ApiResponse<Request>>(`/admin/requests/${id}`),

  approveRequest: (id: string, comment?: string) =>
    apiClient.post<ApiResponse<Request>>(`/admin/requests/${id}/approve`, { comment }),

  rejectRequest: (id: string, reason: string) =>
    apiClient.post<ApiResponse<Request>>(`/admin/requests/${id}/reject`, { reason }),

  requestDocuments: (id: string, message: string) =>
    apiClient.post<ApiResponse<Request>>(`/admin/requests/${id}/request-documents`, { message }),

  startReview: (id: string) =>
    apiClient.post<ApiResponse<Request>>(`/admin/requests/${id}/review`, {}),

  getComments: (requestId: string) =>
    apiClient.get<ApiResponse<Comment[]>>(`/admin/requests/${requestId}/comments`),

  addComment: (requestId: string, content: string, isInternal = false) =>
    apiClient.post<ApiResponse<Comment>>(`/admin/requests/${requestId}/comments`, { content, isInternal }),

  getRequestHistory: (id: string) =>
    apiClient.get<ApiResponse<StatusChange[]>>(`/admin/requests/${id}/history`),
};

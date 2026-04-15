import { apiClient } from './client';
import { ApiResponse, PaginatedResponse } from '../types/api';
import { User, UserRole, AccountStatus } from '../types/user';

export interface UserFilters {
  role?: UserRole;
  status?: AccountStatus;
  page?: number;
  limit?: number;
}

export const usersApi = {
  listUsers: (filters: UserFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.role) params.set('role', filters.role);
    if (filters.status) params.set('status', filters.status);
    params.set('page', String(filters.page ?? 1));
    params.set('limit', String(filters.limit ?? 20));
    return apiClient.get<ApiResponse<PaginatedResponse<User>>>(
      `/users?${params.toString()}`,
    );
  },

  getPendingUsers: () =>
    apiClient.get<ApiResponse<User[]>>('/users/pending'),

  getUser: (id: string) =>
    apiClient.get<ApiResponse<User>>(`/users/${id}`),

  approveUser: (id: string) =>
    apiClient.post<ApiResponse<User>>(`/users/${id}/approve`, {}),

  rejectUser: (id: string, reason: string) =>
    apiClient.post<ApiResponse<User>>(`/users/${id}/reject`, { reason }),

  deactivateUser: (id: string) =>
    apiClient.delete<ApiResponse<User>>(`/users/${id}`),

  reactivateUser: (id: string) =>
    apiClient.post<ApiResponse<User>>(`/users/${id}/reactivate`, {}),
};

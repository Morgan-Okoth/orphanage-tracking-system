import { apiClient } from './client';
import { ApiResponse, PaginatedResponse } from '../types/api';
import { Request, RequestStatus } from '../types/request';

export interface AuditorDashboardStats {
  flaggedCasesCount: number;
  pendingVerificationsCount: number;
  recentAnomaliesCount: number;
  recentAuditLogs?: AuditLog[];
  anomalies?: Anomaly[];
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface Anomaly {
  id: string;
  type: 'REPEATED_REQUEST' | 'AMOUNT_OUTLIER' | 'SUSPICIOUS_PATTERN' | string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  affectedRequestId?: string;
  affectedRequest?: Request;
  detectedAt: string;
}

export const auditorApi = {
  getDashboardStats: () =>
    apiClient.get<ApiResponse<AuditorDashboardStats>>('/admin/auditor-dashboard'),

  listFlaggedRequests: (page = 1, limit = 20) => {
    const params = new URLSearchParams({ status: RequestStatus.FLAGGED, page: String(page), limit: String(limit) });
    return apiClient.get<ApiResponse<PaginatedResponse<Request>>>(`/requests?${params.toString()}`);
  },

  listApprovedRequests: (page = 1, limit = 20) => {
    const params = new URLSearchParams({ status: RequestStatus.APPROVED, page: String(page), limit: String(limit) });
    return apiClient.get<ApiResponse<PaginatedResponse<Request>>>(`/requests?${params.toString()}`);
  },

  getRequest: (id: string) =>
    apiClient.get<ApiResponse<Request>>(`/requests/${id}`),

  verifyRequest: (id: string, auditNotes?: string) =>
    apiClient.post<ApiResponse<Request>>(`/requests/${id}/verify`, { auditNotes }),

  flagRequest: (id: string, reason: string) =>
    apiClient.post<ApiResponse<Request>>(`/requests/${id}/flag`, { reason }),

  getAuditLogs: (filters: AuditLogFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.action) params.set('action', filters.action);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    params.set('page', String(filters.page ?? 1));
    params.set('limit', String(filters.limit ?? 20));
    return apiClient.get<ApiResponse<PaginatedResponse<AuditLog>>>(`/audit-logs?${params.toString()}`);
  },

  getAnomalies: () =>
    apiClient.get<ApiResponse<Anomaly[]>>('/reports/anomalies'),
};

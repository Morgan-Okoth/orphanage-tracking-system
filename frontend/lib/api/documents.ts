import { API_BASE_URL } from '../utils/constants';
import { ApiResponse } from '../types/api';
import { Document } from '../types/document';

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const documentsApi = {
  upload: async (requestId: string, file: File): Promise<ApiResponse<Document>> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/requests/${requestId}/documents`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? 'Upload failed');
    return json as ApiResponse<Document>;
  },

  list: async (requestId: string): Promise<ApiResponse<Document[]>> => {
    const res = await fetch(`${API_BASE_URL}/requests/${requestId}/documents`, {
      headers: { ...getAuthHeaders() },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to fetch documents');
    return json as ApiResponse<Document[]>;
  },

  delete: async (requestId: string, documentId: string): Promise<ApiResponse<null>> => {
    const res = await fetch(
      `${API_BASE_URL}/requests/${requestId}/documents/${documentId}`,
      { method: 'DELETE', headers: getAuthHeaders() },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? 'Delete failed');
    return json as ApiResponse<null>;
  },

  getDownloadUrl: async (documentId: string): Promise<ApiResponse<{ url: string }>> => {
    const res = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
      headers: getAuthHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to get download URL');
    return json as ApiResponse<{ url: string }>;
  },
};

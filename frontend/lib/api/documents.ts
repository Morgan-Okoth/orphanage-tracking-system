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
    formData.append('requestId', requestId);

    const res = await fetch(`${API_BASE_URL}/documents`, {
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
    return {
      ...json,
      data: json?.data?.documents ?? [],
    } as ApiResponse<Document[]>;
  },

  delete: async (documentId: string): Promise<ApiResponse<null>> => {
    const res = await fetch(
      `${API_BASE_URL}/documents/${documentId}`,
      { method: 'DELETE', headers: getAuthHeaders() },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? 'Delete failed');
    return json as ApiResponse<null>;
  },

  download: async (documentId: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      let message = 'Failed to download document';

      try {
        const json = await res.json();
        message = json?.error?.message ?? message;
      } catch {
        // Response may be a non-JSON error body.
      }

      throw new Error(message);
    }

    return res.blob();
  },
};

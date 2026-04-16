import { Context } from 'hono';
import { DocumentService } from '../services/documentService';
import { StorageService } from '../services/storageService';
import { getCurrentUser, isAdmin } from '../api/middleware/auth';
import { ApiResponse } from '../types';
import { sanitizeFileName } from '../utils/validation';

/**
 * Document management handlers
 */

/**
 * POST /api/v1/documents
 * Upload a document and associate it with a request
 */
async function uploadDocument(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const requestId = formData.get('requestId') as string;

    if (!file) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'MISSING_FILE',
            message: 'No file provided',
          },
        },
        400
      );
    }

    if (!requestId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'MISSING_REQUEST_ID',
            message: 'Request ID is required',
          },
        },
        400
      );
    }

    // Verify user has access to the request
    const { requests } = await import('../db/schema');
    const { drizzle } = await import('drizzle-orm/d1');
    const { eq } = await import('drizzle-orm');
    const db = drizzle(c.env.DB);
    
    const request = await db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: 'Request not found',
          },
        },
        404
      );
    }

    // Check authorization - students can only upload to their own requests
    if (!isAdmin(c) && request.studentId !== user.userId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to upload documents to this request',
          },
        },
        403
      );
    }

    // Get file data
    const fileData = await file.arrayBuffer();
    const fileName = sanitizeFileName(file.name);
    const fileType = file.type;
    const fileSize = file.size;

    // Initialize services
    const storageService = new StorageService(c.env.DOCUMENTS_BUCKET);
    const documentService = new DocumentService(c.env.DB, storageService);

    // Upload document
    const document = await documentService.uploadDocument({
      requestId,
      fileName,
      fileType,
      fileSize,
      fileData,
      uploadedById: user.userId,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Document uploaded successfully',
        data: {
          id: document.id,
          fileName: document.fileName,
          fileSize: document.fileSize,
          fileType: document.fileType,
          version: document.version,
          uploadedAt: document.uploadedAt,
        },
      },
      201
    );
  } catch (error) {
    console.error('Error uploading document:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: error instanceof Error ? error.message : 'Failed to upload document',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/documents/:id
 * Get document metadata
 */
async function getDocumentMetadata(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const documentId = c.req.param('id');

    if (!documentId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'MISSING_DOCUMENT_ID',
            message: 'Document ID is required',
          },
        },
        400
      );
    }

    // Initialize services
    const storageService = new StorageService(c.env.DOCUMENTS_BUCKET);
    const documentService = new DocumentService(c.env.DB, storageService);

    // Check if document exists
    const document = await documentService.getDocumentById(documentId);
    if (!document) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found',
          },
        },
        404
      );
    }

    // Check authorization
    const canAccess = await documentService.canAccessDocument(
      documentId,
      user.userId,
      user.role
    );

    if (!canAccess) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to access this document',
          },
        },
        403
      );
    }

    return c.json<ApiResponse>({
      success: true,
      data: {
        id: document.id,
        requestId: document.requestId,
        fileName: document.fileName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        version: document.version,
        uploadedAt: document.uploadedAt,
        scanStatus: document.scanStatus,
      },
    });
  } catch (error) {
    console.error('Error getting document metadata:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch document metadata',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/documents/:id/download
 * Generate pre-signed download URL or stream the file
 */
async function downloadDocument(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const documentId = c.req.param('id');

    if (!documentId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'MISSING_DOCUMENT_ID',
            message: 'Document ID is required',
          },
        },
        400
      );
    }

    // Initialize services
    const storageService = new StorageService(c.env.DOCUMENTS_BUCKET);
    const documentService = new DocumentService(c.env.DB, storageService);

    // Check if document exists
    const document = await documentService.getDocumentById(documentId);
    if (!document) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found',
          },
        },
        404
      );
    }

    // Check authorization
    const canAccess = await documentService.canAccessDocument(
      documentId,
      user.userId,
      user.role
    );

    if (!canAccess) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to download this document',
          },
        },
        403
      );
    }

    // Log document access
    const ipAddress = c.req.header('cf-connecting-ip') || 'unknown';
    await documentService.logDocumentAccess(documentId, user.userId, ipAddress);

    // Get file from R2
    const file = await documentService.getDocumentFile(document.r2Key);
    if (!file) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: 'File not found in storage',
          },
        },
        404
      );
    }

    // Stream the file back to the client
    return new Response(file.body, {
      headers: {
        'Content-Type': document.fileType,
        'Content-Disposition': `attachment; filename="${document.fileName}"`,
        'Content-Length': document.fileSize.toString(),
        'Cache-Control': 'private, max-age=300', // 5 minutes
      },
    });
  } catch (error) {
    console.error('Error downloading document:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'DOWNLOAD_FAILED',
          message: 'Failed to download document',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/requests/:id/documents
 * List all documents for a request
 */
async function listRequestDocuments(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');

    if (!requestId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'MISSING_REQUEST_ID',
            message: 'Request ID is required',
          },
        },
        400
      );
    }

    // Verify request exists and user has access
    const { requests } = await import('../db/schema');
    const { drizzle } = await import('drizzle-orm/d1');
    const { eq } = await import('drizzle-orm');
    const db = drizzle(c.env.DB);
    
    const request = await db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: 'Request not found',
          },
        },
        404
      );
    }

    // Check authorization
    if (!isAdmin(c) && request.studentId !== user.userId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to view documents for this request',
          },
        },
        403
      );
    }

    // Initialize services
    const storageService = new StorageService(c.env.DOCUMENTS_BUCKET);
    const documentService = new DocumentService(c.env.DB, storageService);

    // Get documents
    const documents = await documentService.getDocumentsByRequestId(requestId);

    return c.json<ApiResponse>({
      success: true,
      data: documents.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        version: doc.version,
        uploadedAt: doc.uploadedAt,
        scanStatus: doc.scanStatus,
      })),
    });
  } catch (error) {
    console.error('Error listing request documents:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch documents',
        },
      },
      500
    );
  }
}

/**
 * DELETE /api/v1/documents/:id
 * Soft delete a document (admin only)
 */
async function deleteDocument(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const documentId = c.req.param('id');

    if (!documentId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'MISSING_DOCUMENT_ID',
            message: 'Document ID is required',
          },
        },
        400
      );
    }

    // Only admins can delete documents
    if (!isAdmin(c)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only administrators can delete documents',
          },
        },
        403
      );
    }

    // Initialize services
    const storageService = new StorageService(c.env.DOCUMENTS_BUCKET);
    const documentService = new DocumentService(c.env.DB, storageService);

    // Check if document exists
    const document = await documentService.getDocumentById(documentId);
    if (!document) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found',
          },
        },
        404
      );
    }

    // Soft delete
    await documentService.softDeleteDocument(documentId, user.userId);

    return c.json<ApiResponse>({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: 'Failed to delete document',
        },
      },
      500
    );
  }
}

export const documentHandlers = {
  uploadDocument,
  getDocumentMetadata,
  downloadDocument,
  listRequestDocuments,
  deleteDocument,
};

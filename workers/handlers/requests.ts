import { Context } from 'hono';
import { z } from 'zod';
import { RequestService } from '../services/requestService';
import { DocumentService } from '../services/documentService';
import { StorageService } from '../services/storageService';
import { RequestType, RequestStatus, UserRole, ApiResponse } from '../types';
import { getCurrentUser, isAdmin } from '../api/middleware/auth';
import {
  createRequestSchema,
  updateRequestSchema,
  rejectRequestSchema,
  requestDocsSchema,
  flagRequestSchema,
  createCommentSchema,
} from '../utils/schemas';
import { sanitizeText } from '../utils/validation';

/**
 * POST /api/v1/requests
 * Create a new financial request with documents
 */
async function createRequest(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);

    // Only students can create requests
    if (user.role !== UserRole.STUDENT) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only students can create requests',
          },
        },
        403
      );
    }

    // Parse multipart form data
    const formData = await c.req.formData();
    const type = formData.get('type') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const reason = formData.get('reason') as string;

    // Validate request data
    const validatedData = createRequestSchema.parse({ type, amount, reason });

    // Sanitize text inputs
    const sanitizedReason = sanitizeText(validatedData.reason, 1000);

    // Get uploaded files
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('document') && value instanceof File) {
        files.push(value);
      }
    }

    // Validate at least one document
    if (files.length === 0) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'MISSING_DOCUMENTS',
            message: 'At least one document is required',
          },
        },
        400
      );
    }

    // Validate max 5 documents
    if (files.length > 5) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'TOO_MANY_DOCUMENTS',
            message: 'Maximum 5 documents allowed',
          },
        },
        400
      );
    }

    // Create request
    const requestService = new RequestService(c.env.DB);
    const request = await requestService.createRequest(
      {
        studentId: user.userId,
        type: validatedData.type,
        amount: validatedData.amount,
        reason: sanitizedReason,
      },
      c
    );

    // Upload documents
    const storageService = new StorageService(c.env.DOCUMENTS_BUCKET);
    const documentService = new DocumentService(c.env.DB, storageService);
    const uploadedDocuments = [];

    for (const file of files) {
      const fileData = await file.arrayBuffer();
      const document = await documentService.uploadDocument({
        requestId: request.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData,
        uploadedById: user.userId,
      });
      uploadedDocuments.push(document);
    }

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Request submitted successfully',
        data: {
          id: request.id,
          type: request.type,
          amount: request.amount,
          reason: request.reason,
          status: request.status,
          submittedAt: request.submittedAt,
          documents: uploadedDocuments.map(doc => ({
            id: doc.id,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            fileType: doc.fileType,
          })),
        },
      },
      201
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error) {
      if (error.message === 'INVALID_AMOUNT' || error.message === 'INVALID_AMOUNT_DECIMALS') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: error.message,
              message: 'Invalid amount. Must be positive, max 1,000,000, with max 2 decimal places',
            },
          },
          400
        );
      }
    }

    console.error('Create request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'CREATE_REQUEST_FAILED',
          message: 'Failed to create request',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/requests
 * List requests (filtered by role)
 */
async function listRequests(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestService = new RequestService(c.env.DB);

    // Get query parameters
    const status = c.req.query('status') as RequestStatus | undefined;
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');

    const result = await requestService.listRequests({
      userId: user.userId,
      userRole: user.role,
      status,
      page,
      limit,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: result,
      },
      200
    );
  } catch (error) {
    console.error('List requests error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'LIST_REQUESTS_FAILED',
          message: 'Failed to list requests',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/requests/:id
 * Get request details
 */
async function getRequestById(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const requestService = new RequestService(c.env.DB);

    const request = await requestService.getRequestById(requestId);

    // Check authorization
    if (user.role === UserRole.STUDENT && request.studentId !== user.userId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only view your own requests',
          },
        },
        403
      );
    }

    return c.json<ApiResponse>(
      {
        success: true,
        data: request,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_NOT_FOUND') {
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

    console.error('Get request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'GET_REQUEST_FAILED',
          message: 'Failed to get request',
        },
      },
      500
    );
  }
}

/**
 * PATCH /api/v1/requests/:id
 * Update request (draft only)
 */
async function updateRequest(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = updateRequestSchema.parse(body);

    // Sanitize text inputs
    const sanitizedData = {
      ...validatedData,
      ...(validatedData.reason !== undefined && { reason: sanitizeText(validatedData.reason, 1000) }),
    };

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.updateRequest(
      requestId,
      sanitizedData,
      user.userId,
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Request updated successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'REQUEST_NOT_DRAFT') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'REQUEST_NOT_DRAFT',
              message: 'Only draft requests can be updated',
            },
          },
          400
        );
      }

      if (error.message === 'FORBIDDEN') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only update your own requests',
            },
          },
          403
        );
      }

      if (error.message === 'INVALID_AMOUNT' || error.message === 'INVALID_AMOUNT_DECIMALS') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: error.message,
              message: 'Invalid amount. Must be positive, max 1,000,000, with max 2 decimal places',
            },
          },
          400
        );
      }
    }

    console.error('Update request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'UPDATE_REQUEST_FAILED',
          message: 'Failed to update request',
        },
      },
      500
    );
  }
}

/**
 * DELETE /api/v1/requests/:id
 * Soft delete request (draft only)
 */
async function deleteRequest(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');

    const requestService = new RequestService(c.env.DB);
    await requestService.deleteRequest(requestId, user.userId, c);

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Request deleted successfully',
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'REQUEST_NOT_DRAFT') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'REQUEST_NOT_DRAFT',
              message: 'Only draft requests can be deleted',
            },
          },
          400
        );
      }

      if (error.message === 'FORBIDDEN') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only delete your own requests',
            },
          },
          403
        );
      }
    }

    console.error('Delete request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'DELETE_REQUEST_FAILED',
          message: 'Failed to delete request',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/requests/:id/history
 * Get status change history
 */
async function getRequestHistory(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const requestService = new RequestService(c.env.DB);

    // Verify request exists and user has access
    const request = await requestService.getRequestById(requestId);

    if (user.role === UserRole.STUDENT && request.studentId !== user.userId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only view history for your own requests',
          },
        },
        403
      );
    }

    const history = await requestService.getStatusHistory(requestId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: history,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_NOT_FOUND') {
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

    console.error('Get request history error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'GET_HISTORY_FAILED',
          message: 'Failed to get request history',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/review
 * Start review (Admin Level 1)
 */
async function startReview(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.startReview(requestId, user.userId, c);

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Review started successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'INVALID_STATUS_TRANSITION') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: 'Request cannot be reviewed in its current status',
            },
          },
          400
        );
      }
    }

    console.error('Start review error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'START_REVIEW_FAILED',
          message: 'Failed to start review',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/approve
 * Approve request (Admin Level 1)
 */
async function approveRequest(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.approveRequest(requestId, user.userId, c);

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Request approved successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'INVALID_STATUS_TRANSITION') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: 'Request cannot be approved in its current status',
            },
          },
          400
        );
      }
    }

    console.error('Approve request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'APPROVE_REQUEST_FAILED',
          message: 'Failed to approve request',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/reject
 * Reject request (Admin Level 1 or 2)
 */
async function rejectRequest(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = rejectRequestSchema.parse(body);

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.rejectRequest(
      requestId,
      user.userId,
      sanitizeText(validatedData.reason, 500),
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Request rejected successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'INVALID_STATUS_TRANSITION') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: 'Request cannot be rejected in its current status',
            },
          },
          400
        );
      }
    }

    console.error('Reject request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'REJECT_REQUEST_FAILED',
          message: 'Failed to reject request',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/verify
 * Verify request (Admin Level 2)
 */
async function verifyRequest(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.verifyRequest(requestId, user.userId, c);

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Request verified successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'INVALID_STATUS_TRANSITION') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: 'Request cannot be verified in its current status',
            },
          },
          400
        );
      }
    }

    console.error('Verify request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'VERIFY_REQUEST_FAILED',
          message: 'Failed to verify request',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/flag
 * Flag request (Admin Level 2)
 */
async function flagRequest(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = flagRequestSchema.parse(body);

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.flagRequest(
      requestId,
      user.userId,
      sanitizeText(validatedData.reason, 500),
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Request flagged successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'INVALID_STATUS_TRANSITION') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: 'Request cannot be flagged in its current status',
            },
          },
          400
        );
      }
    }

    console.error('Flag request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'FLAG_REQUEST_FAILED',
          message: 'Failed to flag request',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/request-docs
 * Request additional documents (Admin Level 1)
 */
async function requestAdditionalDocuments(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = requestDocsSchema.parse(body);

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.requestAdditionalDocuments(
      requestId,
      user.userId,
      sanitizeText(validatedData.reason, 500),
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Additional documents requested successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'INVALID_STATUS_TRANSITION') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: 'Cannot request documents in current status',
            },
          },
          400
        );
      }
    }

    console.error('Request documents error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'REQUEST_DOCS_FAILED',
          message: 'Failed to request additional documents',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/comments
 * Add comment to request
 */
async function addComment(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = createCommentSchema.parse(body);

    const requestService = new RequestService(c.env.DB);

    // Verify user has access to the request
    const request = await requestService.getRequestById(requestId);

    if (user.role === UserRole.STUDENT && request.studentId !== user.userId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only comment on your own requests',
          },
        },
        403
      );
    }

    // Students cannot create internal comments
    const isInternal = user.role !== UserRole.STUDENT && validatedData.isInternal === true;

    const comment = await requestService.addComment(
      {
        requestId,
        authorId: user.userId,
        content: sanitizeText(validatedData.content, 2000),
        isInternal,
      },
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Comment added successfully',
        data: comment,
      },
      201
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error && error.message === 'REQUEST_NOT_FOUND') {
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

    console.error('Add comment error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'ADD_COMMENT_FAILED',
          message: 'Failed to add comment',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/requests/:id/comments
 * Get comments for request
 */
async function getComments(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const requestService = new RequestService(c.env.DB);

    // Verify user has access to the request
    const request = await requestService.getRequestById(requestId);

    if (user.role === UserRole.STUDENT && request.studentId !== user.userId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only view comments on your own requests',
          },
        },
        403
      );
    }

    const comments = await requestService.getComments(requestId, user.role);

    return c.json<ApiResponse>(
      {
        success: true,
        data: comments,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_NOT_FOUND') {
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

    console.error('Get comments error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'GET_COMMENTS_FAILED',
          message: 'Failed to get comments',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/dispute
 * Raise a dispute for a paid request (Student only)
 */
async function raiseDispute(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const body = await c.req.json();
    const { reason } = body;

    if (!reason || reason.trim().length < 10) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'INVALID_REASON',
            message: 'Dispute reason must be at least 10 characters',
          },
        },
        400
      );
    }

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.raiseDispute(
      requestId,
      user.userId,
      reason.trim(),
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Dispute raised successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'FORBIDDEN') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only dispute your own requests',
            },
          },
          403
        );
      }

      if (error.message === 'INVALID_STATUS_FOR_DISPUTE') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS',
              message: 'Can only dispute requests with PAID status',
            },
          },
          400
        );
      }
    }

    console.error('Raise dispute error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'RAISE_DISPUTE_FAILED',
          message: 'Failed to raise dispute',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/requests/:id/resolve-dispute
 * Resolve a dispute (Admin only)
 */
async function resolveDispute(c: Context): Promise<Response> {
  try {
    const user = getCurrentUser(c);
    const requestId = c.req.param('id');
    const body = await c.req.json();
    const { resolution, action } = body;

    if (!resolution || resolution.trim().length < 10) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'INVALID_RESOLUTION',
            message: 'Resolution must be at least 10 characters',
          },
        },
        400
      );
    }

    if (!action || !['refund', 'confirm', 'investigate'].includes(action)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: 'Action must be one of: refund, confirm, investigate',
          },
        },
        400
      );
    }

    const requestService = new RequestService(c.env.DB);
    const updatedRequest = await requestService.resolveDispute(
      requestId,
      user.userId,
      resolution.trim(),
      action as 'refund' | 'confirm' | 'investigate',
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Dispute resolved successfully',
        data: updatedRequest,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'REQUEST_NOT_FOUND') {
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

      if (error.message === 'INVALID_STATUS_FOR_RESOLUTION') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS',
              message: 'Can only resolve requests with DISPUTED status',
            },
          },
          400
        );
      }
    }

    console.error('Resolve dispute error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'RESOLVE_DISPUTE_FAILED',
          message: 'Failed to resolve dispute',
        },
      },
      500
    );
  }
}

// Export all handlers
export const requestHandlers = {
  createRequest,
  listRequests,
  getRequestById,
  updateRequest,
  deleteRequest,
  getRequestHistory,
  startReview,
  approveRequest,
  rejectRequest,
  verifyRequest,
  flagRequest,
  requestAdditionalDocuments,
  addComment,
  getComments,
  raiseDispute,
  resolveDispute,
};

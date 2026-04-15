import { Context } from 'hono';
import { ArchivalService } from '../services/archivalService';
import { ApiResponse } from '../types';
import { getCurrentUser } from '../api/middleware/auth';

/**
 * GET /api/v1/requests/archived
 * List archived requests with optional filters and pagination.
 * Requires admin role (ADMIN_LEVEL_1 or ADMIN_LEVEL_2).
 */
async function listArchivedRequests(c: Context): Promise<Response> {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const studentId = c.req.query('studentId');
    const minAmountRaw = c.req.query('minAmount');
    const maxAmountRaw = c.req.query('maxAmount');

    const minAmount = minAmountRaw !== undefined ? parseFloat(minAmountRaw) : undefined;
    const maxAmount = maxAmountRaw !== undefined ? parseFloat(maxAmountRaw) : undefined;

    const archivalService = new ArchivalService();
    const result = await archivalService.searchArchivedRequests(c.env.DB, {
      page,
      limit,
      dateFrom,
      dateTo,
      studentId,
      minAmount,
      maxAmount,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: result,
      },
      200
    );
  } catch (error) {
    console.error('List archived requests error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'LIST_ARCHIVED_FAILED',
          message: 'Failed to list archived requests',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/requests/archived/:id
 * Get a single archived request with all associated data.
 * Requires auth.
 */
async function getArchivedRequest(c: Context): Promise<Response> {
  try {
    const requestId = c.req.param('id');
    const archivalService = new ArchivalService();
    const request = await archivalService.getArchivedRequestById(c.env.DB, requestId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: request,
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

      if (error.message === 'REQUEST_NOT_ARCHIVED') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'REQUEST_NOT_ARCHIVED',
              message: 'Request is not archived',
            },
          },
          400
        );
      }
    }

    console.error('Get archived request error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'GET_ARCHIVED_FAILED',
          message: 'Failed to get archived request',
        },
      },
      500
    );
  }
}

export default { listArchivedRequests, getArchivedRequest };

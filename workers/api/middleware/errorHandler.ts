import { Context } from 'hono';
import { ApiResponse } from '../../types';

/**
 * Global error handler middleware
 */
export function errorHandlerMiddleware() {
  return async (err: Error, c: Context) => {
    console.error('Error:', err);

    // Handle specific error types
    if (err.name === 'ZodError') {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: err,
          },
        },
        400
      );
    }

    // Default error response
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
      },
      500
    );
  };
}

/**
 * Request validation middleware using Zod schemas
 * Requirements: 3.3, 15.7
 */
import { Context, Next } from 'hono';
import { z, ZodSchema } from 'zod';
import { ApiResponse } from '../../types';

/**
 * Middleware factory: validates JSON request body against a Zod schema.
 * Attaches the parsed data to `c.set('validatedBody', data)`.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Request body must be valid JSON',
          },
        },
        400
      );
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: result.error.flatten().fieldErrors as Record<string, unknown>,
          },
        },
        400
      );
    }

    c.set('validatedBody', result.data);
    await next();
  };
}

/**
 * Middleware factory: validates query parameters against a Zod schema.
 * Attaches the parsed data to `c.set('validatedQuery', data)`.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    const query = Object.fromEntries(
      new URL(c.req.url).searchParams.entries()
    );

    const result = schema.safeParse(query);
    if (!result.success) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: result.error.flatten().fieldErrors as Record<string, unknown>,
          },
        },
        400
      );
    }

    c.set('validatedQuery', result.data);
    await next();
  };
}

/**
 * Helper: parse and validate a JSON body inline (for use inside handlers).
 * Returns `{ data, error }` — no middleware needed.
 */
export function parseBody<T>(
  schema: ZodSchema<T>,
  raw: unknown
): { data: T; error: null } | { data: null; error: Response } {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const errorResponse = Response.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: result.error.flatten().fieldErrors,
        },
      } satisfies ApiResponse,
      { status: 400 }
    );
    return { data: null, error: errorResponse };
  }
  return { data: result.data, error: null };
}

// Re-export ZodError for convenience in handlers
export { z };

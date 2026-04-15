import { Context, Next } from 'hono';

/**
 * CORS middleware for frontend-backend communication.
 * Supports dynamic allowed origins from environment configuration.
 * Requirements: 15.2
 */
export function corsMiddleware() {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('Origin');

    // Build allowed origins list from environment + defaults
    const env = c.env as Record<string, string | undefined>;
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      env.FRONTEND_URL,
    ].filter((o): o is string => Boolean(o));

    const isAllowed = origin ? allowedOrigins.includes(origin) : false;

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      if (isAllowed && origin) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Access-Control-Allow-Credentials', 'true');
        c.header('Vary', 'Origin');
      }
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      c.header('Access-Control-Max-Age', '600');
      return c.text('', 204);
    }

    // Set CORS headers for allowed origins
    if (isAllowed && origin) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
    }

    await next();
  };
}

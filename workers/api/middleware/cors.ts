import { Context, Next } from 'hono';

function isAllowedOrigin(origin: string | undefined, frontendUrl?: string): origin is string {
  if (!origin) return false;

  const staticAllowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    'https://orphanage-tracking-frontend.vercel.app',
  ]);

  if (frontendUrl) {
    staticAllowedOrigins.add(frontendUrl);
  }

  if (staticAllowedOrigins.has(origin)) {
    return true;
  }

  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

/**
 * CORS middleware for frontend-backend communication.
 * Supports dynamic allowed origins from environment configuration.
 * Requirements: 15.2
 */
export function corsMiddleware() {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('Origin');

    const env = c.env as Record<string, string | undefined>;
    const isAllowed = isAllowedOrigin(origin, env.FRONTEND_URL);

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      if (isAllowed && origin) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Access-Control-Allow-Credentials', 'true');
        c.header('Vary', 'Origin');
      }
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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

import { Context, Next } from 'hono';

/**
 * Rate limiting configuration
 * - Public endpoints (unauthenticated): 100 requests per 15 minutes per IP
 * - Authenticated endpoints: 1000 requests per 15 minutes per user
 * Requirements: 15.2
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes in milliseconds
const WINDOW_SECONDS = 15 * 60;   // 15 minutes in seconds (for KV TTL)

const PUBLIC_LIMIT = 100;
const AUTH_LIMIT = 1000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Get the client identifier for rate limiting.
 * Uses user ID for authenticated requests, IP for public requests.
 */
function getClientId(c: Context): { id: string; isAuthenticated: boolean } {
  // Check if user is authenticated (set by auth middleware)
  const user = c.get('user') as { userId?: string } | undefined;
  if (user?.userId) {
    return { id: `user:${user.userId}`, isAuthenticated: true };
  }

  // Fall back to IP address
  const ip =
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    c.req.header('X-Real-IP') ||
    'unknown';

  return { id: `ip:${ip}`, isAuthenticated: false };
}

/**
 * Rate limiting middleware using Cloudflare KV for request tracking.
 */
export function rateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    const kv: KVNamespace | undefined = (c.env as Record<string, unknown>)?.CACHE as KVNamespace | undefined;

    // If KV is not available (e.g., in tests), skip rate limiting
    if (!kv) {
      await next();
      return;
    }

    const { id: clientId, isAuthenticated } = getClientId(c);
    const limit = isAuthenticated ? AUTH_LIMIT : PUBLIC_LIMIT;
    const kvKey = `ratelimit:${clientId}`;

    const now = Date.now();

    // Fetch current rate limit entry from KV
    let entry: RateLimitEntry;
    const stored = await kv.get(kvKey, 'json') as RateLimitEntry | null;

    if (!stored || now >= stored.resetAt) {
      // New window
      entry = { count: 1, resetAt: now + WINDOW_MS };
    } else {
      entry = { count: stored.count + 1, resetAt: stored.resetAt };
    }

    // Persist updated entry with TTL
    const ttlSeconds = Math.ceil((entry.resetAt - now) / 1000);
    await kv.put(kvKey, JSON.stringify(entry), { expirationTtl: Math.max(ttlSeconds, 1) });

    const remaining = Math.max(0, limit - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    c.header('X-RateLimit-Window', String(WINDOW_SECONDS));

    if (entry.count > limit) {
      c.header('Retry-After', String(resetSeconds));
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
        },
        429
      );
    }

    await next();
  };
}

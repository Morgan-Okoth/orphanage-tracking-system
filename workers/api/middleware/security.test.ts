import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context } from 'hono';
import { securityHeadersMiddleware } from './securityHeaders';
import { rateLimitMiddleware } from './rateLimit';
import { JWTPayload } from '../../types';
import { UserRole } from '../../types';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const mockKV = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const val = store.get(key);
      if (!val) return null;
      return type === 'json' ? JSON.parse(val) : val;
    },
    put: async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
};

const makeUser = (userId = 'user-123'): JWTPayload => ({
  userId,
  email: 'test@example.com',
  role: UserRole.STUDENT,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

interface MockContextOptions {
  user?: JWTPayload;
  kv?: KVNamespace;
  ip?: string;
}

const mockContext = ({ user, kv, ip = '1.2.3.4' }: MockContextOptions = {}): Context => {
  const headers = new Map<string, string>();
  const store = new Map<string, unknown>();
  if (user) store.set('user', user);

  return {
    get: (key: string) => store.get(key),
    set: vi.fn((key: string, value: unknown) => store.set(key, value)),
    json: vi.fn().mockReturnValue(new Response()),
    header: vi.fn((name: string, value: string) => headers.set(name, value)),
    _headers: headers,
    req: {
      header: vi.fn((name: string) => {
        if (name === 'CF-Connecting-IP') return ip;
        return undefined;
      }),
    },
    env: {
      JWT_SECRET: 'test-secret',
      SESSIONS: {},
      ...(kv ? { CACHE: kv } : {}),
    },
  } as unknown as Context;
};

const mockNext = vi.fn().mockResolvedValue(undefined);

// ─── Security Headers ─────────────────────────────────────────────────────────

describe('securityHeadersMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets Content-Security-Policy with default-src self', async () => {
    const c = mockContext();
    await securityHeadersMiddleware()(c, mockNext);

    const cspCall = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'Content-Security-Policy'
    );
    expect(cspCall).toBeDefined();
    expect(cspCall[1]).toContain("default-src 'self'");
  });

  it('sets Content-Security-Policy with frame-ancestors none', async () => {
    const c = mockContext();
    await securityHeadersMiddleware()(c, mockNext);

    const cspCall = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'Content-Security-Policy'
    );
    expect(cspCall[1]).toContain("frame-ancestors 'none'");
  });

  it('sets Strict-Transport-Security with max-age=31536000', async () => {
    const c = mockContext();
    await securityHeadersMiddleware()(c, mockNext);

    const hstsCall = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'Strict-Transport-Security'
    );
    expect(hstsCall).toBeDefined();
    expect(hstsCall[1]).toContain('max-age=31536000');
  });

  it('sets Strict-Transport-Security with includeSubDomains', async () => {
    const c = mockContext();
    await securityHeadersMiddleware()(c, mockNext);

    const hstsCall = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'Strict-Transport-Security'
    );
    expect(hstsCall[1]).toContain('includeSubDomains');
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const c = mockContext();
    await securityHeadersMiddleware()(c, mockNext);

    const call = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'X-Content-Type-Options'
    );
    expect(call).toBeDefined();
    expect(call[1]).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const c = mockContext();
    await securityHeadersMiddleware()(c, mockNext);

    const call = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'X-Frame-Options'
    );
    expect(call).toBeDefined();
    expect(call[1]).toBe('DENY');
  });

  it('sets Referrer-Policy', async () => {
    const c = mockContext();
    await securityHeadersMiddleware()(c, mockNext);

    const call = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'Referrer-Policy'
    );
    expect(call).toBeDefined();
    expect(call[1]).toBeTruthy();
  });

  it('sets Permissions-Policy', async () => {
    const c = mockContext();
    await securityHeadersMiddleware()(c, mockNext);

    const call = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'Permissions-Policy'
    );
    expect(call).toBeDefined();
    expect(call[1]).toBeTruthy();
  });

  it('calls next() before setting headers', async () => {
    const c = mockContext();
    const callOrder: string[] = [];
    const trackedNext = vi.fn().mockImplementation(async () => {
      callOrder.push('next');
    });
    (c.header as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('header');
    });

    await securityHeadersMiddleware()(c, trackedNext);

    expect(callOrder[0]).toBe('next');
    expect(callOrder).toContain('header');
  });
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when request is under the limit', async () => {
    const kv = mockKV();
    const c = mockContext({ kv });
    await rateLimitMiddleware()(c, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
    expect(c.json).not.toHaveBeenCalled();
  });

  it('returns 429 with RATE_LIMIT_EXCEEDED when limit is exceeded', async () => {
    const kv = mockKV();
    // Pre-fill KV with a count at the public limit (100)
    const resetAt = Date.now() + 60_000;
    await kv.put('ratelimit:ip:1.2.3.4', JSON.stringify({ count: 100, resetAt }));

    const c = mockContext({ kv });
    await rateLimitMiddleware()(c, mockNext);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
      }),
      429
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('sets X-RateLimit-Limit header', async () => {
    const kv = mockKV();
    const c = mockContext({ kv });
    await rateLimitMiddleware()(c, mockNext);

    const call = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'X-RateLimit-Limit'
    );
    expect(call).toBeDefined();
    expect(Number(call[1])).toBeGreaterThan(0);
  });

  it('sets X-RateLimit-Remaining header', async () => {
    const kv = mockKV();
    const c = mockContext({ kv });
    await rateLimitMiddleware()(c, mockNext);

    const call = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'X-RateLimit-Remaining'
    );
    expect(call).toBeDefined();
    expect(Number(call[1])).toBeGreaterThanOrEqual(0);
  });

  it('sets X-RateLimit-Reset header', async () => {
    const kv = mockKV();
    const c = mockContext({ kv });
    await rateLimitMiddleware()(c, mockNext);

    const call = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'X-RateLimit-Reset'
    );
    expect(call).toBeDefined();
    expect(Number(call[1])).toBeGreaterThan(0);
  });

  it('uses higher limit (1000) for authenticated users', async () => {
    const kv = mockKV();
    const user = makeUser();
    const c = mockContext({ kv, user });
    await rateLimitMiddleware()(c, mockNext);

    const limitCall = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'X-RateLimit-Limit'
    );
    expect(Number(limitCall[1])).toBe(1000);
  });

  it('uses lower limit (100) for unauthenticated users', async () => {
    const kv = mockKV();
    const c = mockContext({ kv }); // no user
    await rateLimitMiddleware()(c, mockNext);

    const limitCall = (c.header as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]: [string]) => name === 'X-RateLimit-Limit'
    );
    expect(Number(limitCall[1])).toBe(100);
  });

  it('skips rate limiting gracefully when CACHE KV is not available', async () => {
    const c = mockContext(); // no kv
    await rateLimitMiddleware()(c, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
    expect(c.json).not.toHaveBeenCalled();
  });

  it('resets count after the window expires', async () => {
    const kv = mockKV();
    // Expired window with count at limit
    const expiredResetAt = Date.now() - 1000;
    await kv.put('ratelimit:ip:1.2.3.4', JSON.stringify({ count: 100, resetAt: expiredResetAt }));

    const c = mockContext({ kv });
    await rateLimitMiddleware()(c, mockNext);

    // Should pass through because window reset
    expect(mockNext).toHaveBeenCalledOnce();
    expect(c.json).not.toHaveBeenCalled();
  });

  it('authenticated users are rate-limited by user ID, not IP', async () => {
    const kv = mockKV();
    const user = makeUser('user-999');
    // Pre-fill IP key at limit — should not affect authenticated user
    const resetAt = Date.now() + 60_000;
    await kv.put('ratelimit:ip:1.2.3.4', JSON.stringify({ count: 100, resetAt }));

    const c = mockContext({ kv, user });
    await rateLimitMiddleware()(c, mockNext);

    // Authenticated user has a separate key and higher limit, so should pass
    expect(mockNext).toHaveBeenCalledOnce();
  });
});

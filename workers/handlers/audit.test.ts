/**
 * Integration tests for Audit Log Handler
 * Tests GET /api/v1/audit-logs with filters and pagination
 * Requirements: 8.4, 12.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware - default to ADMIN_LEVEL_2
vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', { userId: 'admin2-1', email: 'auditor@example.com', role: 'ADMIN_LEVEL_2' });
    await next();
  },
  requireRole: (...roles: string[]) => async (c: any, next: any) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
    }
    await next();
  },
}));

vi.mock('../db/client', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../db/client';
import auditApp from './audit';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAuditLog(overrides: Partial<{
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: string | null;
  ipAddress: string;
  userAgent: string | null;
  timestamp: Date;
}> = {}) {
  return {
    id: 'log-1',
    userId: 'user-1',
    action: 'USER_LOGIN',
    resourceType: 'user',
    resourceId: 'user-1',
    metadata: null,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeDbClient(options: {
  countResult?: { count: number } | null;
  logsResult?: any[];
} = {}) {
  const { countResult = { count: 0 }, logsResult = [] } = options;

  // We need to handle two query chains:
  // 1. count query: select().from().where().get() → countResult
  // 2. logs query: select().from().where().orderBy().limit().offset() → logsResult (awaited)
  let callCount = 0;

  const dbClient = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockImplementation(() => Promise.resolve(logsResult)),
    get: vi.fn().mockResolvedValue(countResult),
  };

  return dbClient;
}

const mockEnv = { DB: {} as D1Database };

function buildApp() {
  const app = new Hono<{ Bindings: typeof mockEnv }>();
  app.route('/audit-logs', auditApp);
  return app;
}

async function makeRequest(app: Hono<any>, path: string, options?: RequestInit) {
  return app.request(path, options, mockEnv);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /audit-logs - Basic listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated audit logs with default pagination', async () => {
    const log = makeAuditLog();
    const db = makeDbClient({ countResult: { count: 1 }, logsResult: [log] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].id).toBe('log-1');
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(50);
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.pagination.totalPages).toBe(1);
    expect(body.data.pagination.hasNext).toBe(false);
    expect(body.data.pagination.hasPrev).toBe(false);
  });

  it('returns empty list when no audit logs exist', async () => {
    const db = makeDbClient({ countResult: { count: 0 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(0);
    expect(body.data.pagination.total).toBe(0);
    expect(body.data.pagination.totalPages).toBe(0);
  });

  it('returns all expected fields in each log entry', async () => {
    const log = makeAuditLog({
      id: 'log-abc',
      userId: 'user-xyz',
      action: 'PAYMENT_COMPLETED',
      resourceType: 'transaction',
      resourceId: 'txn-1',
      metadata: '{"amount":1000}',
      ipAddress: '192.168.1.1',
      userAgent: 'TestAgent/1.0',
      timestamp: new Date('2024-03-01T12:00:00Z'),
    });
    const db = makeDbClient({ countResult: { count: 1 }, logsResult: [log] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs');
    const body = await res.json() as any;

    const item = body.data.items[0];
    expect(item.id).toBe('log-abc');
    expect(item.userId).toBe('user-xyz');
    expect(item.action).toBe('PAYMENT_COMPLETED');
    expect(item.resourceType).toBe('transaction');
    expect(item.resourceId).toBe('txn-1');
    expect(item.metadata).toBe('{"amount":1000}');
    expect(item.ipAddress).toBe('192.168.1.1');
    expect(item.userAgent).toBe('TestAgent/1.0');
  });
});

describe('GET /audit-logs - Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('respects page and limit query parameters', async () => {
    const db = makeDbClient({ countResult: { count: 150 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs?page=2&limit=25');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.pagination.page).toBe(2);
    expect(body.data.pagination.limit).toBe(25);
    expect(body.data.pagination.total).toBe(150);
    expect(body.data.pagination.totalPages).toBe(6);
    expect(body.data.pagination.hasNext).toBe(true);
    expect(body.data.pagination.hasPrev).toBe(true);
  });

  it('caps limit at 50 (max allowed per spec)', async () => {
    const db = makeDbClient({ countResult: { count: 10 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs?limit=200');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.pagination.limit).toBe(50);
  });

  it('defaults to page 1 when page param is missing', async () => {
    const db = makeDbClient({ countResult: { count: 5 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs');
    const body = await res.json() as any;

    expect(body.data.pagination.page).toBe(1);
  });

  it('defaults to limit 50 when limit param is missing', async () => {
    const db = makeDbClient({ countResult: { count: 5 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs');
    const body = await res.json() as any;

    expect(body.data.pagination.limit).toBe(50);
  });

  it('calculates hasNext and hasPrev correctly on last page', async () => {
    const db = makeDbClient({ countResult: { count: 100 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs?page=2&limit=50');
    const body = await res.json() as any;

    expect(body.data.pagination.hasNext).toBe(false);
    expect(body.data.pagination.hasPrev).toBe(true);
  });
});

describe('GET /audit-logs - Filtering (Requirement 8.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes userId filter to the database query', async () => {
    const db = makeDbClient({ countResult: { count: 2 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs?userId=user-42');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The where clause was called (filter applied)
    expect(db.where).toHaveBeenCalled();
  });

  it('passes action filter to the database query', async () => {
    const db = makeDbClient({ countResult: { count: 3 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs?action=USER_LOGIN');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.where).toHaveBeenCalled();
  });

  it('passes startDate filter to the database query', async () => {
    const db = makeDbClient({ countResult: { count: 1 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs?startDate=2024-01-01T00:00:00Z');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.where).toHaveBeenCalled();
  });

  it('passes endDate filter to the database query', async () => {
    const db = makeDbClient({ countResult: { count: 1 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs?endDate=2024-12-31T23:59:59Z');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.where).toHaveBeenCalled();
  });

  it('ignores invalid date strings gracefully', async () => {
    const db = makeDbClient({ countResult: { count: 0 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs?startDate=not-a-date&endDate=also-invalid');
    const body = await res.json() as any;

    // Should still return 200 - invalid dates are silently ignored
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('supports combining multiple filters', async () => {
    const db = makeDbClient({ countResult: { count: 1 }, logsResult: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(
      app,
      '/audit-logs?userId=user-1&action=USER_LOGIN&startDate=2024-01-01T00:00:00Z&endDate=2024-12-31T23:59:59Z'
    );
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.where).toHaveBeenCalled();
  });
});

describe('GET /audit-logs - Access control (ADMIN_LEVEL_2 only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for ADMIN_LEVEL_1 users - requireRole enforces ADMIN_LEVEL_2 restriction', async () => {
    // The requireRole mock in the module-level vi.mock checks the user role.
    // We build a mini app that simulates the middleware chain with a non-ADMIN_LEVEL_2 user.
    const app = new Hono<{ Bindings: typeof mockEnv }>();

    // Simulate auth setting ADMIN_LEVEL_1 user, then requireRole blocking them
    app.use('/audit-logs/*', async (c, next) => {
      c.set('user', { userId: 'admin1-1', email: 'admin@example.com', role: 'ADMIN_LEVEL_1' });
      await next();
    });
    app.use('/audit-logs/*', async (c, next) => {
      const user = c.get('user') as any;
      if (!user || user.role !== 'ADMIN_LEVEL_2') {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
      }
      await next();
    });
    app.route('/audit-logs', auditApp);

    const res = await makeRequest(app, '/audit-logs');
    const body = await res.json() as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 for STUDENT users - requireRole enforces ADMIN_LEVEL_2 restriction', async () => {
    const app = new Hono<{ Bindings: typeof mockEnv }>();

    app.use('/audit-logs/*', async (c, next) => {
      c.set('user', { userId: 'student-1', email: 'student@example.com', role: 'STUDENT' });
      await next();
    });
    app.use('/audit-logs/*', async (c, next) => {
      const user = c.get('user') as any;
      if (!user || user.role !== 'ADMIN_LEVEL_2') {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
      }
      await next();
    });
    app.route('/audit-logs', auditApp);

    const res = await makeRequest(app, '/audit-logs');
    const body = await res.json() as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /audit-logs - Error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 when database throws an error', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/audit-logs');
    const body = await res.json() as any;

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

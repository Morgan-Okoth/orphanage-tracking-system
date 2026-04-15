/**
 * Integration tests for Admin Dashboard Handlers
 * Tests GET /api/v1/admin/dashboard and GET /api/v1/admin/auditor-dashboard
 * Requirements: 10.1, 10.2, 10.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mutable user state so individual tests can control the role
let mockUser: { userId: string; email: string; role: string } | null = {
  userId: 'admin1-1',
  email: 'admin@example.com',
  role: 'ADMIN_LEVEL_1',
};

vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    if (!mockUser) {
      return c.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        401
      );
    }
    c.set('user', mockUser);
    await next();
  },
  requireRole: (...roles: string[]) => async (c: any, next: any) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        403
      );
    }
    await next();
  },
}));

vi.mock('../db/client', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../db/client';
import adminApp from './admin';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockEnv = {
  DB: {} as D1Database,
  CACHE: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  },
};

function buildApp() {
  const app = new Hono<{ Bindings: typeof mockEnv }>();
  app.route('/admin', adminApp);
  return app;
}

async function makeRequest(app: Hono<any>, path: string, options?: RequestInit) {
  return app.request(path, options, mockEnv);
}

// ─── Dashboard Statistics Tests ──────────────────────────────────────────────

describe('GET /admin/dashboard - Statistics calculation (Requirement 10.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { userId: 'admin1-1', email: 'admin@example.com', role: 'ADMIN_LEVEL_1' };
    mockEnv.CACHE.get.mockResolvedValue(null);
    mockEnv.CACHE.put.mockResolvedValue(undefined);
  });

  it('returns request counts grouped by status', async () => {
    const statusCounts = [
      { status: 'SUBMITTED', count: 5 },
      { status: 'UNDER_REVIEW', count: 3 },
      { status: 'APPROVED', count: 2 },
      { status: 'PAID', count: 10 },
      { status: 'REJECTED', count: 1 },
    ];

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue(statusCounts),
      get: vi.fn().mockResolvedValue({ total: 5000 }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.requestsByStatus).toBeDefined();
    expect(body.data.requestsByStatus['SUBMITTED']).toBe(5);
    expect(body.data.requestsByStatus['UNDER_REVIEW']).toBe(3);
    expect(body.data.requestsByStatus['APPROVED']).toBe(2);
    expect(body.data.requestsByStatus['PAID']).toBe(10);
    expect(body.data.requestsByStatus['REJECTED']).toBe(1);
  });

  it('returns total disbursed funds for current month', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ total: 75000.5 }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalDisbursedThisMonth).toBe(75000.5);
  });

  it('returns 0 for totalDisbursedThisMonth when no transactions exist', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ total: null }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.totalDisbursedThisMonth).toBe(0);
  });

  it('returns pending actions with awaiting review and verification counts', async () => {
    const statusCounts = [
      { status: 'SUBMITTED', count: 7 },
      { status: 'APPROVED', count: 4 },
    ];

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue(statusCounts),
      get: vi.fn().mockResolvedValue({ total: 0 }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.pendingActions).toBeDefined();
    expect(body.data.pendingActions.awaitingReview).toBe(7);
    expect(body.data.pendingActions.awaitingVerification).toBe(4);
    expect(body.data.pendingActions.total).toBe(11);
  });

  it('returns pendingActions.total = 0 when no pending requests', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([{ status: 'PAID', count: 20 }]),
      get: vi.fn().mockResolvedValue({ total: 10000 }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.pendingActions.awaitingReview).toBe(0);
    expect(body.data.pendingActions.awaitingVerification).toBe(0);
    expect(body.data.pendingActions.total).toBe(0);
  });

  it('includes generatedAt timestamp in response', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ total: 0 }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.generatedAt).toBeDefined();
    expect(new Date(body.data.generatedAt).getTime()).not.toBeNaN();
  });

  it('serves cached response when cache hit occurs', async () => {
    const cachedStats = {
      requestsByStatus: { SUBMITTED: 3 },
      totalDisbursedThisMonth: 9999,
      pendingActions: { awaitingReview: 3, awaitingVerification: 0, total: 3 },
      generatedAt: '2024-01-15T10:00:00.000Z',
    };
    mockEnv.CACHE.get.mockResolvedValue(JSON.stringify(cachedStats));

    const db = { select: vi.fn() };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.totalDisbursedThisMonth).toBe(9999);
    // DB should not be queried when cache is hit
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns 500 when database throws an error', async () => {
    mockEnv.CACHE.get.mockResolvedValue(null);
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

// ─── Auditor Dashboard Tests ─────────────────────────────────────────────────

describe('GET /admin/auditor-dashboard - Auditor data (Requirement 10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { userId: 'admin2-1', email: 'auditor@example.com', role: 'ADMIN_LEVEL_2' };
    mockEnv.CACHE.get.mockResolvedValue(null);
    mockEnv.CACHE.put.mockResolvedValue(undefined);
  });

  function makeFlaggedCase(overrides: Partial<{
    id: string; studentId: string; type: string; amount: number;
    status: string; flagReason: string | null; submittedAt: Date;
  }> = {}) {
    return {
      id: 'req-1',
      studentId: 'student-1',
      type: 'SCHOOL_FEES',
      amount: 5000,
      status: 'FLAGGED',
      flagReason: 'Suspicious duplicate',
      submittedAt: new Date('2024-01-10T08:00:00Z'),
      ...overrides,
    };
  }

  function makeAuditLogEntry(overrides: Partial<{
    id: string; userId: string | null; action: string; resourceType: string;
    resourceId: string | null; metadata: string | null; ipAddress: string; timestamp: Date;
  }> = {}) {
    return {
      id: 'log-1',
      userId: 'admin-1',
      action: 'REQUEST_STATUS_CHANGED',
      resourceType: 'request',
      resourceId: 'req-1',
      metadata: null,
      ipAddress: '127.0.0.1',
      timestamp: new Date('2024-01-15T10:00:00Z'),
      ...overrides,
    };
  }

  /**
   * Build a mock DB for the auditor-dashboard endpoint.
   * The handler makes these calls in order:
   *   1. select().from().where(FLAGGED).orderBy() → flaggedCases (awaited array)
   *   2. select().from().orderBy().limit(10)      → auditLogs (awaited array)
   *   3. select().from().where().groupBy().having() → repeatedStudents (awaited array)
   *   4. For each request type: select().from().where().get() → statsResult
   */
  function makeAuditorDb(options: {
    flaggedCases?: any[];
    auditLogs?: any[];
    repeatedStudents?: any[];
    statsResult?: any;
  } = {}) {
    const {
      flaggedCases = [],
      auditLogs = [],
      repeatedStudents = [],
      statsResult = null,
    } = options;

    let orderByCallCount = 0;

    const db: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockImplementation(() => {
        orderByCallCount++;
        if (orderByCallCount === 1) {
          // flagged cases: .where(FLAGGED).orderBy() → returns array directly
          return Promise.resolve(flaggedCases);
        }
        // audit logs: .orderBy().limit()
        return db;
      }),
      limit: vi.fn().mockResolvedValue(auditLogs),
      groupBy: vi.fn().mockReturnThis(),
      having: vi.fn().mockResolvedValue(repeatedStudents),
      get: vi.fn().mockResolvedValue(statsResult),
    };

    return db;
  }

  it('returns flagged cases in the response', async () => {
    const flagged = [makeFlaggedCase(), makeFlaggedCase({ id: 'req-2', flagReason: 'High amount' })];
    const db = makeAuditorDb({ flaggedCases: flagged, auditLogs: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.flaggedCases).toHaveLength(2);
    expect(body.data.flaggedCases[0].status).toBe('FLAGGED');
    expect(body.data.flaggedCases[0].flagReason).toBe('Suspicious duplicate');
  });

  it('returns recent audit log entries (up to 10)', async () => {
    const logs = Array.from({ length: 10 }, (_, i) =>
      makeAuditLogEntry({ id: `log-${i + 1}`, action: 'USER_LOGIN' })
    );
    const db = makeAuditorDb({ flaggedCases: [], auditLogs: logs });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.recentAuditLogs).toHaveLength(10);
    expect(body.data.recentAuditLogs[0].action).toBe('USER_LOGIN');
  });

  it('returns anomaly detection results array', async () => {
    const db = makeAuditorDb({ flaggedCases: [], auditLogs: [], repeatedStudents: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.anomalies).toBeDefined();
    expect(Array.isArray(body.data.anomalies)).toBe(true);
  });

  it('flags REPEATED_REQUESTS anomaly for students with > 3 requests in 30 days', async () => {
    const db = makeAuditorDb({
      flaggedCases: [],
      auditLogs: [],
      repeatedStudents: [{ studentId: 'student-99', requestCount: 5 }],
      statsResult: null,
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    const repeatedAnomaly = body.data.anomalies.find((a: any) => a.type === 'REPEATED_REQUESTS');
    expect(repeatedAnomaly).toBeDefined();
    expect(repeatedAnomaly.studentId).toBe('student-99');
    expect(repeatedAnomaly.severity).toBe('medium');
  });

  it('assigns high severity for students with > 6 requests in 30 days', async () => {
    const db = makeAuditorDb({
      flaggedCases: [],
      auditLogs: [],
      repeatedStudents: [{ studentId: 'student-99', requestCount: 8 }],
      statsResult: null,
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    const repeatedAnomaly = body.data.anomalies.find((a: any) => a.type === 'REPEATED_REQUESTS');
    expect(repeatedAnomaly).toBeDefined();
    expect(repeatedAnomaly.severity).toBe('high');
  });

  it('includes generatedAt timestamp in response', async () => {
    const db = makeAuditorDb({ flaggedCases: [], auditLogs: [] });
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.generatedAt).toBeDefined();
    expect(new Date(body.data.generatedAt).getTime()).not.toBeNaN();
  });

  it('returns 500 when database throws an error', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockRejectedValue(new Error('DB error')),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

// ─── Authorization Tests ─────────────────────────────────────────────────────

describe('Authorization - Admin-only endpoints (Requirement 10.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.CACHE.get.mockResolvedValue(null);
    mockEnv.CACHE.put.mockResolvedValue(undefined);
  });

  it('ADMIN_LEVEL_1 can access /admin/dashboard', async () => {
    mockUser = { userId: 'admin1-1', email: 'admin@example.com', role: 'ADMIN_LEVEL_1' };
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ total: 0 }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');

    expect(res.status).toBe(200);
  });

  it('ADMIN_LEVEL_2 can access /admin/dashboard', async () => {
    mockUser = { userId: 'admin2-1', email: 'auditor@example.com', role: 'ADMIN_LEVEL_2' };
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ total: 0 }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');

    expect(res.status).toBe(200);
  });

  it('STUDENT gets 403 for /admin/dashboard', async () => {
    mockUser = { userId: 'student-1', email: 'student@example.com', role: 'STUDENT' };

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('STUDENT gets 403 for /admin/auditor-dashboard', async () => {
    mockUser = { userId: 'student-1', email: 'student@example.com', role: 'STUDENT' };

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('ADMIN_LEVEL_1 gets 403 for /admin/auditor-dashboard (ADMIN_LEVEL_2 only)', async () => {
    mockUser = { userId: 'admin1-1', email: 'admin@example.com', role: 'ADMIN_LEVEL_1' };

    const app = buildApp();
    const res = await makeRequest(app, '/admin/auditor-dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('unauthenticated request (no user) gets 401', async () => {
    mockUser = null;

    const app = buildApp();
    const res = await makeRequest(app, '/admin/dashboard');
    const body = await res.json() as any;

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });
});

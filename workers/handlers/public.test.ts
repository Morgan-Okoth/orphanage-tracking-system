/**
 * Integration tests for Public Transparency Dashboard Handlers
 * Tests GET /api/v1/public/statistics, /statistics/monthly, /statistics/by-type, /charts/funding
 * Requirements: 11.1, 11.4, 11.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../db/client', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../db/client';
import publicApp from './public';

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
  app.route('/public', publicApp);
  return app;
}

async function makeRequest(app: Hono<any>, path: string, options?: RequestInit) {
  return app.request(path, options, mockEnv);
}

/** Build a mock DB that returns a single stats row via .get() */
function makeStatsRow(overrides: Partial<{
  id: string;
  date: string;
  totalReceived: number;
  totalDisbursed: number;
  requestsApproved: number;
  requestsRejected: number;
  requestsByType: string;
  amountsByType: string;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'stats-1',
    date: '2024-03-15',
    totalReceived: 100000,
    totalDisbursed: 100000,
    requestsApproved: 20,
    requestsRejected: 5,
    requestsByType: JSON.stringify({ SCHOOL_FEES: 10, MEDICAL_EXPENSES: 5, SUPPLIES: 3, EMERGENCY: 1, OTHER: 1 }),
    amountsByType: JSON.stringify({ SCHOOL_FEES: 50000, MEDICAL_EXPENSES: 25000, SUPPLIES: 15000, EMERGENCY: 5000, OTHER: 5000 }),
    updatedAt: new Date('2024-03-15T00:00:00Z'),
    ...overrides,
  };
}

/** Build a mock DB for the /statistics endpoint (single row via .get()) */
function makeStatsSingleDb(row: ReturnType<typeof makeStatsRow> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(row),
  };
}

/** Build a mock DB for endpoints that return multiple rows (array) */
function makeStatsArrayDb(rows: ReturnType<typeof makeStatsRow>[]) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(rows[0] ?? null),
  };
}

// ─── GET /public/statistics ──────────────────────────────────────────────────

describe('GET /public/statistics - Overall statistics (Requirements 11.1, 11.4, 11.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.CACHE.get.mockResolvedValue(null);
    mockEnv.CACHE.put.mockResolvedValue(undefined);
  });

  it('is accessible without authentication (no auth header required)', async () => {
    const db = makeStatsSingleDb(makeStatsRow());
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    // No Authorization header — should still succeed
    const res = await makeRequest(app, '/public/statistics');

    expect(res.status).toBe(200);
  });

  it('returns success:true with statistics data', async () => {
    const db = makeStatsSingleDb(makeStatsRow());
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('returns totalReceived and totalDisbursed (Requirement 11.2)', async () => {
    const db = makeStatsSingleDb(makeStatsRow({ totalReceived: 100000, totalDisbursed: 100000 }));
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics');
    const body = await res.json() as any;

    expect(body.data.totalReceived).toBe(100000);
    expect(body.data.totalDisbursed).toBe(100000);
  });

  it('returns requestsApproved and requestsRejected counts (Requirement 11.3)', async () => {
    const db = makeStatsSingleDb(makeStatsRow({ requestsApproved: 20, requestsRejected: 5 }));
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics');
    const body = await res.json() as any;

    expect(body.data.requestsApproved).toBe(20);
    expect(body.data.requestsRejected).toBe(5);
  });

  it('does NOT expose student names, emails, or phone numbers (Requirement 11.4)', async () => {
    const db = makeStatsSingleDb(makeStatsRow());
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics');
    const body = await res.json() as any;
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toContain('studentId');
    expect(bodyStr).not.toContain('email');
    expect(bodyStr).not.toContain('phone');
    expect(bodyStr).not.toContain('firstName');
    expect(bodyStr).not.toContain('lastName');
  });

  it('returns requestsByType and amountsByType without student identities (Requirement 11.5)', async () => {
    const db = makeStatsSingleDb(makeStatsRow());
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics');
    const body = await res.json() as any;

    expect(body.data.requestsByType).toBeDefined();
    expect(body.data.amountsByType).toBeDefined();
    // Values are aggregated counts/amounts, not individual student data
    expect(typeof body.data.requestsByType).toBe('object');
    expect(typeof body.data.amountsByType).toBe('object');
  });

  it('returns 404 when no statistics are available yet', async () => {
    const db = makeStatsSingleDb(null);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics');
    const body = await res.json() as any;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('serves cached response on cache hit (no DB query)', async () => {
    const cachedStats = makeStatsRow();
    mockEnv.CACHE.get.mockResolvedValue(JSON.stringify(cachedStats));

    const db = { select: vi.fn() };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.totalReceived).toBe(100000);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('stores result in cache after DB query', async () => {
    const db = makeStatsSingleDb(makeStatsRow());
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    await makeRequest(app, '/public/statistics');

    expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
      'public:statistics:overall',
      expect.any(String),
      { expirationTtl: 3600 }
    );
  });

  it('returns 500 when database throws an error', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockRejectedValue(new Error('DB error')),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics');
    const body = await res.json() as any;

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

// ─── GET /public/statistics/monthly ─────────────────────────────────────────

describe('GET /public/statistics/monthly - Monthly breakdown (Requirement 11.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.CACHE.get.mockResolvedValue(null);
    mockEnv.CACHE.put.mockResolvedValue(undefined);
  });

  it('is accessible without authentication', async () => {
    const db = makeStatsArrayDb([]);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/monthly');

    expect(res.status).toBe(200);
  });

  it('returns an array of monthly statistics', async () => {
    const rows = [
      makeStatsRow({ date: '2024-01-15', totalReceived: 30000, totalDisbursed: 30000, requestsApproved: 6, requestsRejected: 1 }),
      makeStatsRow({ date: '2024-02-10', totalReceived: 40000, totalDisbursed: 40000, requestsApproved: 8, requestsRejected: 2 }),
    ];
    const db = makeStatsArrayDb(rows);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/monthly');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('groups rows by month (YYYY-MM) and aggregates totals', async () => {
    // Two rows in the same month should be summed
    const rows = [
      makeStatsRow({ date: '2024-01-10', totalReceived: 20000, totalDisbursed: 20000, requestsApproved: 4, requestsRejected: 1 }),
      makeStatsRow({ date: '2024-01-25', totalReceived: 15000, totalDisbursed: 15000, requestsApproved: 3, requestsRejected: 0 }),
    ];
    const db = makeStatsArrayDb(rows);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/monthly');
    const body = await res.json() as any;

    expect(body.data).toHaveLength(1);
    const jan = body.data[0];
    expect(jan.month).toBe('2024-01');
    expect(jan.totalReceived).toBe(35000);
    expect(jan.totalDisbursed).toBe(35000);
    expect(jan.requestsApproved).toBe(7);
    expect(jan.requestsRejected).toBe(1);
  });

  it('returns separate entries for different months', async () => {
    const rows = [
      makeStatsRow({ date: '2024-01-15', totalReceived: 10000, totalDisbursed: 10000, requestsApproved: 2, requestsRejected: 0 }),
      makeStatsRow({ date: '2024-02-20', totalReceived: 20000, totalDisbursed: 20000, requestsApproved: 4, requestsRejected: 1 }),
      makeStatsRow({ date: '2024-03-05', totalReceived: 30000, totalDisbursed: 30000, requestsApproved: 6, requestsRejected: 2 }),
    ];
    const db = makeStatsArrayDb(rows);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/monthly');
    const body = await res.json() as any;

    expect(body.data).toHaveLength(3);
    const months = body.data.map((m: any) => m.month);
    expect(months).toContain('2024-01');
    expect(months).toContain('2024-02');
    expect(months).toContain('2024-03');
  });

  it('returns empty array when no statistics exist', async () => {
    const db = makeStatsArrayDb([]);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/monthly');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('does not expose student identities in monthly data (Requirement 11.4)', async () => {
    const rows = [makeStatsRow({ date: '2024-01-15' })];
    const db = makeStatsArrayDb(rows);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/monthly');
    const body = await res.json() as any;
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toContain('studentId');
    expect(bodyStr).not.toContain('email');
    expect(bodyStr).not.toContain('phone');
  });

  it('serves cached response on cache hit', async () => {
    const cached = [{ month: '2024-01', totalReceived: 50000, totalDisbursed: 50000, requestsApproved: 10, requestsRejected: 2 }];
    mockEnv.CACHE.get.mockResolvedValue(JSON.stringify(cached));

    const db = { select: vi.fn() };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/monthly');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data[0].totalReceived).toBe(50000);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns 500 when database throws an error', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockRejectedValue(new Error('DB error')),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/monthly');
    const body = await res.json() as any;

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

// ─── GET /public/statistics/by-type ─────────────────────────────────────────

describe('GET /public/statistics/by-type - Statistics by request type (Requirement 11.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.CACHE.get.mockResolvedValue(null);
    mockEnv.CACHE.put.mockResolvedValue(undefined);
  });

  it('is accessible without authentication', async () => {
    const db = makeStatsSingleDb(makeStatsRow());
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');

    expect(res.status).toBe(200);
  });

  it('returns requestsByType and amountsByType objects', async () => {
    const db = makeStatsSingleDb(makeStatsRow());
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.requestsByType).toBeDefined();
    expect(body.data.amountsByType).toBeDefined();
  });

  it('returns correct request counts per type', async () => {
    const requestsByType = { SCHOOL_FEES: 10, MEDICAL_EXPENSES: 5, SUPPLIES: 3, EMERGENCY: 1, OTHER: 1 };
    const db = makeStatsSingleDb(makeStatsRow({ requestsByType: JSON.stringify(requestsByType) }));
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');
    const body = await res.json() as any;

    expect(body.data.requestsByType.SCHOOL_FEES).toBe(10);
    expect(body.data.requestsByType.MEDICAL_EXPENSES).toBe(5);
    expect(body.data.requestsByType.SUPPLIES).toBe(3);
    expect(body.data.requestsByType.EMERGENCY).toBe(1);
    expect(body.data.requestsByType.OTHER).toBe(1);
  });

  it('returns correct amounts per type', async () => {
    const amountsByType = { SCHOOL_FEES: 50000, MEDICAL_EXPENSES: 25000, SUPPLIES: 15000, EMERGENCY: 5000, OTHER: 5000 };
    const db = makeStatsSingleDb(makeStatsRow({ amountsByType: JSON.stringify(amountsByType) }));
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');
    const body = await res.json() as any;

    expect(body.data.amountsByType.SCHOOL_FEES).toBe(50000);
    expect(body.data.amountsByType.MEDICAL_EXPENSES).toBe(25000);
  });

  it('returns asOf date field', async () => {
    const db = makeStatsSingleDb(makeStatsRow({ date: '2024-03-15' }));
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');
    const body = await res.json() as any;

    expect(body.data.asOf).toBe('2024-03-15');
  });

  it('does not expose student identities in type breakdown (Requirement 11.4, 11.5)', async () => {
    const db = makeStatsSingleDb(makeStatsRow());
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');
    const body = await res.json() as any;
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toContain('studentId');
    expect(bodyStr).not.toContain('email');
    expect(bodyStr).not.toContain('phone');
    expect(bodyStr).not.toContain('firstName');
    expect(bodyStr).not.toContain('lastName');
  });

  it('returns 404 when no statistics are available', async () => {
    const db = makeStatsSingleDb(null);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');
    const body = await res.json() as any;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('serves cached response on cache hit', async () => {
    const cached = {
      requestsByType: { SCHOOL_FEES: 7 },
      amountsByType: { SCHOOL_FEES: 35000 },
      asOf: '2024-03-15',
    };
    mockEnv.CACHE.get.mockResolvedValue(JSON.stringify(cached));

    const db = { select: vi.fn() };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.requestsByType.SCHOOL_FEES).toBe(7);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns 500 when database throws an error', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockRejectedValue(new Error('DB error')),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/statistics/by-type');
    const body = await res.json() as any;

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

// ─── GET /public/charts/funding ──────────────────────────────────────────────

describe('GET /public/charts/funding - Funding chart data (Requirement 11.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.CACHE.get.mockResolvedValue(null);
    mockEnv.CACHE.put.mockResolvedValue(undefined);
  });

  it('is accessible without authentication', async () => {
    const db = makeStatsArrayDb([]);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');

    expect(res.status).toBe(200);
  });

  it('returns labels, datasets, and trends', async () => {
    const rows = [makeStatsRow({ date: '2024-01-15' })];
    const db = makeStatsArrayDb(rows);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.labels)).toBe(true);
    expect(body.data.datasets).toBeDefined();
    expect(body.data.trends).toBeDefined();
  });

  it('returns datasets with received, disbursed, approved, rejected arrays', async () => {
    const rows = [makeStatsRow({ date: '2024-01-15' })];
    const db = makeStatsArrayDb(rows);
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    expect(Array.isArray(body.data.datasets.received)).toBe(true);
    expect(Array.isArray(body.data.datasets.disbursed)).toBe(true);
    expect(Array.isArray(body.data.datasets.approved)).toBe(true);
    expect(Array.isArray(body.data.datasets.rejected)).toBe(true);
  });

  it('groups data by month chronologically', async () => {
    const rows = [
      makeStatsRow({ date: '2024-01-10', totalReceived: 10000, totalDisbursed: 10000, requestsApproved: 2, requestsRejected: 0 }),
      makeStatsRow({ date: '2024-02-15', totalReceived: 20000, totalDisbursed: 20000, requestsApproved: 4, requestsRejected: 1 }),
      makeStatsRow({ date: '2024-03-20', totalReceived: 30000, totalDisbursed: 30000, requestsApproved: 6, requestsRejected: 2 }),
    ];
    // The handler orders by date ascending, so we simulate that
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    expect(body.data.labels).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(body.data.datasets.received).toEqual([10000, 20000, 30000]);
    expect(body.data.datasets.disbursed).toEqual([10000, 20000, 30000]);
    expect(body.data.datasets.approved).toEqual([2, 4, 6]);
    expect(body.data.datasets.rejected).toEqual([0, 1, 2]);
  });

  it('aggregates multiple rows in the same month', async () => {
    const rows = [
      makeStatsRow({ date: '2024-01-10', totalReceived: 10000, totalDisbursed: 10000, requestsApproved: 2, requestsRejected: 0 }),
      makeStatsRow({ date: '2024-01-25', totalReceived: 15000, totalDisbursed: 15000, requestsApproved: 3, requestsRejected: 1 }),
    ];
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    expect(body.data.labels).toEqual(['2024-01']);
    expect(body.data.datasets.received[0]).toBe(25000);
    expect(body.data.datasets.approved[0]).toBe(5);
    expect(body.data.datasets.rejected[0]).toBe(1);
  });

  it('calculates month-over-month trend for received funds', async () => {
    const rows = [
      makeStatsRow({ date: '2024-01-15', totalReceived: 10000, totalDisbursed: 10000, requestsApproved: 2, requestsRejected: 0 }),
      makeStatsRow({ date: '2024-02-15', totalReceived: 12000, totalDisbursed: 12000, requestsApproved: 3, requestsRejected: 0 }),
    ];
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    // (12000 - 10000) / 10000 * 100 = 20%
    expect(body.data.trends.received).toBe(20);
  });

  it('returns null trends when only one month of data exists', async () => {
    const rows = [makeStatsRow({ date: '2024-01-15' })];
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    expect(body.data.trends.received).toBeNull();
    expect(body.data.trends.disbursed).toBeNull();
  });

  it('returns empty labels and datasets when no data exists', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.labels).toEqual([]);
    expect(body.data.datasets.received).toEqual([]);
  });

  it('does not expose student identities in chart data (Requirement 11.4)', async () => {
    const rows = [makeStatsRow({ date: '2024-01-15' })];
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toContain('studentId');
    expect(bodyStr).not.toContain('email');
    expect(bodyStr).not.toContain('phone');
  });

  it('serves cached response on cache hit', async () => {
    const cached = {
      labels: ['2024-01'],
      datasets: { received: [50000], disbursed: [50000], approved: [10], rejected: [2] },
      trends: { received: null, disbursed: null },
    };
    mockEnv.CACHE.get.mockResolvedValue(JSON.stringify(cached));

    const db = { select: vi.fn() };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.labels).toEqual(['2024-01']);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns 500 when database throws an error', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockRejectedValue(new Error('DB error')),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const app = buildApp();
    const res = await makeRequest(app, '/public/charts/funding');
    const body = await res.json() as any;

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

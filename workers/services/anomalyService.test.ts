/**
 * Unit tests for anomalyService
 * Tests repeated-request detection and amount-outlier detection.
 * Requirements: 12.2, 12.3, 12.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectRepeatedRequests,
  detectAmountOutliers,
  detectAnomalies,
  type AnomalyResult,
} from './anomalyService';
import { RequestType } from '../types';

// ─── Mock drizzle-orm/d1 ─────────────────────────────────────────────────────

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(),
}));

import { drizzle } from 'drizzle-orm/d1';

/** Minimal fake D1Database binding */
function fakeD1(): D1Database {
  return {} as D1Database;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a mock drizzle ORM that returns controlled data.
 *
 * For detectRepeatedRequests:
 *   - .select().from().where().groupBy().having() → returns `repeatedRows`
 *
 * For detectAmountOutliers (called once per RequestType):
 *   - .select().from().where().get() → returns statsRow
 *   - .select().from().where() (no .get()) → returns outlierRows via .all() or iteration
 *
 * We use a simple call-sequence approach: each call to the terminal method
 * (.get() or the array-returning chain) pops from a queue.
 */
function buildMockOrm(options: {
  repeatedRows?: Array<{ studentId: string; requestCount: number }>;
  /** Per-type stats: array of { mean, stddev } indexed by REQUEST_TYPES order */
  typeStats?: Array<{ mean: number | null; stddev: number | null }>;
  /** Per-type outlier rows returned after stats */
  typeOutliers?: Array<Array<{ id: string; studentId: string; amount: number }>>;
}) {
  const {
    repeatedRows = [],
    typeStats = [],
    typeOutliers = [],
  } = options;

  const REQUEST_TYPES = Object.values(RequestType);

  // We track which "phase" we're in via call counters
  let statsCallIndex = 0;
  let outliersCallIndex = 0;

  // The mock ORM object — all methods return `this` for chaining
  const orm: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    having: vi.fn().mockImplementation(() => {
      // Terminal for detectRepeatedRequests
      return Promise.resolve(repeatedRows);
    }),
    get: vi.fn().mockImplementation(() => {
      // Terminal for stats query in detectAmountOutliers
      const stat = typeStats[statsCallIndex] ?? null;
      statsCallIndex++;
      return Promise.resolve(stat);
    }),
    // For the outlier fetch we return an array directly (no .all() needed)
    // The service iterates the result of the second select query.
    // We override the second select chain to resolve with outlier rows.
  };

  // We need to differentiate between the stats .get() call and the outlier
  // select call. We do this by tracking how many times .select() is called
  // within each type iteration.
  //
  // Strategy: replace .select() to return different chains depending on context.
  let selectCallCount = 0;

  orm.select = vi.fn().mockImplementation(() => {
    selectCallCount++;
    return orm;
  });

  // Override .where() to be context-aware:
  // - After .groupBy().having() → repeated requests (handled above)
  // - After stats .get() → stats query
  // - After outlier fetch → outlier rows
  //
  // Simpler approach: track whether the last chain ended with .get() or array.
  // We'll use a flag set by .having() vs .get() vs direct array return.

  // Reset and use a cleaner approach with separate chain objects:
  return buildCleanMockOrm(repeatedRows, typeStats, typeOutliers);
}

function buildCleanMockOrm(
  repeatedRows: Array<{ studentId: string; requestCount: number }>,
  typeStats: Array<{ mean: number | null; stddev: number | null }>,
  typeOutliers: Array<Array<{ id: string; studentId: string; amount: number }>>,
) {
  let statsCallIndex = 0;
  let outliersCallIndex = 0;

  // We need to distinguish between:
  // 1. The repeated-requests query (ends with .having())
  // 2. The stats query per type (ends with .get())
  // 3. The outliers query per type (ends with direct array — we use .all() or just return)
  //
  // The service code does:
  //   orm.select(...).from(...).where(...).groupBy(...).having(...)  → repeated
  //   orm.select(...).from(...).where(...).get()                     → stats
  //   orm.select(...).from(...).where(...)                           → outliers (iterated directly)
  //
  // Since the outlier query result is iterated with `for (const outlier of outliers)`,
  // it must be an iterable. The service awaits the whole chain, so we need the
  // chain to resolve to an array.

  // We'll track state with a simple counter per "query type"
  let queryPhase: 'repeated' | 'stats' | 'outliers' = 'repeated';
  let typeIndex = 0; // which RequestType we're on (0..4)
  let withinTypePhase: 'stats' | 'outliers' = 'stats';

  // Build a chainable object
  const chain: any = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);

  chain.where = vi.fn().mockReturnValue(chain);

  chain.having = vi.fn().mockImplementation(() => {
    return Promise.resolve(repeatedRows);
  });

  chain.get = vi.fn().mockImplementation(() => {
    const stat = typeStats[statsCallIndex] ?? null;
    statsCallIndex++;
    withinTypePhase = 'outliers';
    return Promise.resolve(stat);
  });

  // The outlier query: service does `const outliers = await orm.select(...).from(...).where(...)`
  // Since .where() returns `chain` and the service awaits it, we need .where() to
  // sometimes return a Promise<array>. But .where() also needs to return `chain`
  // for the stats query (which then calls .get()).
  //
  // We solve this by making .where() return a thenable chain that also has .get():
  // - If .get() is called on it → stats query
  // - If awaited directly → outliers query
  //
  // We implement this with a custom thenable.

  chain.where = vi.fn().mockImplementation(() => {
    // Return a thenable that also has .get(), .groupBy(), .having()
    const thenableChain: any = {
      groupBy: vi.fn().mockReturnValue({
        having: vi.fn().mockImplementation(() => Promise.resolve(repeatedRows)),
      }),
      get: vi.fn().mockImplementation(() => {
        const stat = typeStats[statsCallIndex] ?? null;
        statsCallIndex++;
        return Promise.resolve(stat);
      }),
      then: (resolve: Function, reject: Function) => {
        // Awaited directly → outlier rows
        const rows = typeOutliers[outliersCallIndex] ?? [];
        outliersCallIndex++;
        return Promise.resolve(rows).then(resolve as any, reject as any);
      },
    };
    return thenableChain;
  });

  return chain;
}

// ─── detectRepeatedRequests ───────────────────────────────────────────────────

describe('detectRepeatedRequests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no students exceed the threshold', async () => {
    const orm = buildCleanMockOrm([], [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const results = await detectRepeatedRequests(fakeD1());
    expect(results).toEqual([]);
  });

  it('returns one anomaly per student exceeding 3 requests in 30 days', async () => {
    const repeatedRows = [
      { studentId: 'student-1', requestCount: 4 },
      { studentId: 'student-2', requestCount: 5 },
    ];
    const orm = buildCleanMockOrm(repeatedRows, [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const results = await detectRepeatedRequests(fakeD1());
    expect(results).toHaveLength(2);
  });

  it('sets type to REPEATED_REQUESTS', async () => {
    const orm = buildCleanMockOrm([{ studentId: 'student-1', requestCount: 4 }], [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectRepeatedRequests(fakeD1());
    expect(result.type).toBe('REPEATED_REQUESTS');
  });

  it('sets studentId correctly', async () => {
    const orm = buildCleanMockOrm([{ studentId: 'student-abc', requestCount: 4 }], [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectRepeatedRequests(fakeD1());
    expect(result.studentId).toBe('student-abc');
  });

  it('sets requestId to empty string (student-level anomaly)', async () => {
    const orm = buildCleanMockOrm([{ studentId: 'student-1', requestCount: 4 }], [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectRepeatedRequests(fakeD1());
    expect(result.requestId).toBe('');
  });

  it('assigns medium severity for 4-6 requests', async () => {
    const orm = buildCleanMockOrm([{ studentId: 'student-1', requestCount: 5 }], [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectRepeatedRequests(fakeD1());
    expect(result.severity).toBe('medium');
  });

  it('assigns high severity for more than 6 requests', async () => {
    const orm = buildCleanMockOrm([{ studentId: 'student-1', requestCount: 7 }], [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectRepeatedRequests(fakeD1());
    expect(result.severity).toBe('high');
  });

  it('includes request count in description', async () => {
    const orm = buildCleanMockOrm([{ studentId: 'student-1', requestCount: 4 }], [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectRepeatedRequests(fakeD1());
    expect(result.description).toContain('4');
  });

  it('sets detectedAt to a valid ISO timestamp', async () => {
    const orm = buildCleanMockOrm([{ studentId: 'student-1', requestCount: 4 }], [], []);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectRepeatedRequests(fakeD1());
    expect(() => new Date(result.detectedAt)).not.toThrow();
    expect(new Date(result.detectedAt).toISOString()).toBe(result.detectedAt);
  });
});

// ─── detectAmountOutliers ─────────────────────────────────────────────────────

describe('detectAmountOutliers', () => {
  beforeEach(() => vi.clearAllMocks());

  const REQUEST_TYPES = Object.values(RequestType);

  it('returns empty array when all type stats are null (no data)', async () => {
    const typeStats = REQUEST_TYPES.map(() => ({ mean: null, stddev: null }));
    const orm = buildCleanMockOrm([], typeStats, REQUEST_TYPES.map(() => []));
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const results = await detectAmountOutliers(fakeD1());
    expect(results).toEqual([]);
  });

  it('returns empty array when stddev is 0 (all amounts identical)', async () => {
    const typeStats = REQUEST_TYPES.map(() => ({ mean: 1000, stddev: 0 }));
    const orm = buildCleanMockOrm([], typeStats, REQUEST_TYPES.map(() => []));
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const results = await detectAmountOutliers(fakeD1());
    expect(results).toEqual([]);
  });

  it('flags a request exceeding mean + 3*stddev', async () => {
    // mean=1000, stddev=100 → threshold=1300; amount=1500 is an outlier
    const typeStats = [
      { mean: 1000, stddev: 100 },
      ...REQUEST_TYPES.slice(1).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-1', amount: 1500 }],
      ...REQUEST_TYPES.slice(1).map(() => []),
    ];
    const orm = buildCleanMockOrm([], typeStats, typeOutliers);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const results = await detectAmountOutliers(fakeD1());
    expect(results).toHaveLength(1);
    expect(results[0].requestId).toBe('req-1');
  });

  it('does not flag a request below the threshold', async () => {
    // mean=1000, stddev=100 → threshold=1300; amount=1200 is NOT an outlier
    const typeStats = [
      { mean: 1000, stddev: 100 },
      ...REQUEST_TYPES.slice(1).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-1', amount: 1200 }],
      ...REQUEST_TYPES.slice(1).map(() => []),
    ];
    const orm = buildCleanMockOrm([], typeStats, typeOutliers);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const results = await detectAmountOutliers(fakeD1());
    expect(results).toHaveLength(0);
  });

  it('flags a request exactly at the threshold (>= threshold)', async () => {
    // mean=1000, stddev=100 → threshold=1300; amount=1300 is at threshold
    const typeStats = [
      { mean: 1000, stddev: 100 },
      ...REQUEST_TYPES.slice(1).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-1', amount: 1300 }],
      ...REQUEST_TYPES.slice(1).map(() => []),
    ];
    const orm = buildCleanMockOrm([], typeStats, typeOutliers);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const results = await detectAmountOutliers(fakeD1());
    expect(results).toHaveLength(1);
  });

  it('sets type to AMOUNT_OUTLIER', async () => {
    const typeStats = [
      { mean: 1000, stddev: 100 },
      ...REQUEST_TYPES.slice(1).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-1', amount: 1500 }],
      ...REQUEST_TYPES.slice(1).map(() => []),
    ];
    const orm = buildCleanMockOrm([], typeStats, typeOutliers);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectAmountOutliers(fakeD1());
    expect(result.type).toBe('AMOUNT_OUTLIER');
  });

  it('sets severity to high for amount outliers', async () => {
    const typeStats = [
      { mean: 1000, stddev: 100 },
      ...REQUEST_TYPES.slice(1).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-1', amount: 1500 }],
      ...REQUEST_TYPES.slice(1).map(() => []),
    ];
    const orm = buildCleanMockOrm([], typeStats, typeOutliers);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectAmountOutliers(fakeD1());
    expect(result.severity).toBe('high');
  });

  it('includes mean and request type in description', async () => {
    const typeStats = [
      { mean: 1000, stddev: 100 },
      ...REQUEST_TYPES.slice(1).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-1', amount: 1500 }],
      ...REQUEST_TYPES.slice(1).map(() => []),
    ];
    const orm = buildCleanMockOrm([], typeStats, typeOutliers);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectAmountOutliers(fakeD1());
    expect(result.description).toContain('1000.00');
    expect(result.description).toContain(REQUEST_TYPES[0]);
  });

  it('sets detectedAt to a valid ISO timestamp', async () => {
    const typeStats = [
      { mean: 1000, stddev: 100 },
      ...REQUEST_TYPES.slice(1).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-1', amount: 1500 }],
      ...REQUEST_TYPES.slice(1).map(() => []),
    ];
    const orm = buildCleanMockOrm([], typeStats, typeOutliers);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const [result] = await detectAmountOutliers(fakeD1());
    expect(new Date(result.detectedAt).toISOString()).toBe(result.detectedAt);
  });

  it('can detect outliers across multiple request types', async () => {
    // First two types have outliers, rest have no data
    const typeStats = [
      { mean: 1000, stddev: 100 },
      { mean: 500, stddev: 50 },
      ...REQUEST_TYPES.slice(2).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-1', amount: 1500 }],
      [{ id: 'req-2', studentId: 'student-2', amount: 800 }],
      ...REQUEST_TYPES.slice(2).map(() => []),
    ];
    const orm = buildCleanMockOrm([], typeStats, typeOutliers);
    vi.mocked(drizzle).mockReturnValue(orm as any);

    const results = await detectAmountOutliers(fakeD1());
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.requestId)).toContain('req-1');
    expect(results.map((r) => r.requestId)).toContain('req-2');
  });
});

// ─── detectAnomalies (combined) ───────────────────────────────────────────────

describe('detectAnomalies', () => {
  beforeEach(() => vi.clearAllMocks());

  const REQUEST_TYPES = Object.values(RequestType);

  it('returns combined results from both detectors', async () => {
    // repeated: 1 student; outliers: 1 request in first type
    const repeatedRows = [{ studentId: 'student-1', requestCount: 4 }];
    const typeStats = [
      { mean: 1000, stddev: 100 },
      ...REQUEST_TYPES.slice(1).map(() => ({ mean: null, stddev: null })),
    ];
    const typeOutliers = [
      [{ id: 'req-1', studentId: 'student-2', amount: 1500 }],
      ...REQUEST_TYPES.slice(1).map(() => []),
    ];

    // detectAnomalies calls both functions in parallel, each gets its own drizzle() call
    let callCount = 0;
    vi.mocked(drizzle).mockImplementation(() => {
      callCount++;
      // First call → repeated requests orm, second call → outliers orm
      if (callCount === 1) {
        return buildCleanMockOrm(repeatedRows, [], []) as any;
      } else {
        return buildCleanMockOrm([], typeStats, typeOutliers) as any;
      }
    });

    const results = await detectAnomalies(fakeD1());
    expect(results).toHaveLength(2);

    const types = results.map((r) => r.type);
    expect(types).toContain('REPEATED_REQUESTS');
    expect(types).toContain('AMOUNT_OUTLIER');
  });

  it('returns empty array when no anomalies detected', async () => {
    const typeStats = REQUEST_TYPES.map(() => ({ mean: null, stddev: null }));

    let callCount = 0;
    vi.mocked(drizzle).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return buildCleanMockOrm([], [], []) as any;
      } else {
        return buildCleanMockOrm([], typeStats, REQUEST_TYPES.map(() => [])) as any;
      }
    });

    const results = await detectAnomalies(fakeD1());
    expect(results).toEqual([]);
  });

  it('each result has all required AnomalyResult fields', async () => {
    const repeatedRows = [{ studentId: 'student-1', requestCount: 4 }];

    let callCount = 0;
    vi.mocked(drizzle).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return buildCleanMockOrm(repeatedRows, [], []) as any;
      } else {
        return buildCleanMockOrm([], REQUEST_TYPES.map(() => ({ mean: null, stddev: null })), REQUEST_TYPES.map(() => [])) as any;
      }
    });

    const results = await detectAnomalies(fakeD1());
    for (const result of results) {
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('requestId');
      expect(result).toHaveProperty('studentId');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('severity');
      expect(result).toHaveProperty('detectedAt');
    }
  });
});

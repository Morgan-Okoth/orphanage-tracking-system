/**
 * Unit tests for publicStatsService
 * Tests daily aggregation, anonymization, and upsert logic.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateStats } from './publicStatsService';
import { RequestStatus, RequestType } from '../types';

// ─── Mock drizzle-orm/d1 ─────────────────────────────────────────────────────

// We intercept drizzle() so we can control what the DB returns.
const mockGet = vi.fn();
const mockAll = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockValues = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn().mockReturnThis();
const mockWhere = vi.fn().mockReturnThis();

// Chainable query builder returned by drizzle()
function makeChain(getResult: any) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    and: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(getResult),
    all: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
}

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(),
}));

import { drizzle } from 'drizzle-orm/d1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal fake D1Database binding */
function fakeD1(): D1Database {
  return {} as D1Database;
}

/**
 * Build a mock drizzle client that sequences .get() calls.
 * The first call returns `transactionResult` (total received),
 * then `approvedResult`, then `rejectedResult`,
 * then one result per RequestType for the per-type queries,
 * then `existingResult` for the upsert check.
 */
function buildMockDb(options: {
  totalReceived?: number;
  requestsApproved?: number;
  requestsRejected?: number;
  perTypeCount?: number;
  perTypeAmount?: number;
  existingRow?: { id: string } | null;
}) {
  const {
    totalReceived = 50000,
    requestsApproved = 10,
    requestsRejected = 2,
    perTypeCount = 3,
    perTypeAmount = 15000,
    existingRow = null,
  } = options;

  const allRequestTypes = Object.values(RequestType); // 5 types

  // Build the sequence of .get() return values
  const sequence = [
    // 1. total received (transactions sum)
    { total: totalReceived },
    // 2. requests approved count
    { count: requestsApproved },
    // 3. requests rejected count
    { count: requestsRejected },
    // 4–8. per-type queries (one per RequestType)
    ...allRequestTypes.map(() => ({ count: perTypeCount, total: perTypeAmount })),
    // 9. upsert check (existing row)
    existingRow,
  ];

  let callIndex = 0;

  const insertedRows: any[] = [];
  const updatedSets: any[] = [];

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockImplementation(() => {
      const result = sequence[callIndex] ?? null;
      callIndex++;
      return Promise.resolve(result);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockImplementation((vals: any) => {
      insertedRows.push(vals);
      return Promise.resolve();
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockImplementation((vals: any) => {
      updatedSets.push(vals);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  };

  return { db, insertedRows, updatedSets };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('aggregateStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a DailyStats object with today\'s ISO date', async () => {
    const { db } = buildMockDb({});
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    const today = new Date().toISOString().slice(0, 10);
    expect(stats.date).toBe(today);
  });

  it('sets totalReceived from completed transaction sum', async () => {
    const { db } = buildMockDb({ totalReceived: 75000 });
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    expect(stats.totalReceived).toBe(75000);
  });

  it('sets totalDisbursed equal to totalReceived', async () => {
    const { db } = buildMockDb({ totalReceived: 42000 });
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    expect(stats.totalDisbursed).toBe(stats.totalReceived);
  });

  it('sets requestsApproved from PAID request count', async () => {
    const { db } = buildMockDb({ requestsApproved: 8 });
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    expect(stats.requestsApproved).toBe(8);
  });

  it('sets requestsRejected from REJECTED request count', async () => {
    const { db } = buildMockDb({ requestsRejected: 3 });
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    expect(stats.requestsRejected).toBe(3);
  });

  it('includes all RequestType keys in requestsByType', async () => {
    const { db } = buildMockDb({ perTypeCount: 2 });
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    const expectedTypes = Object.values(RequestType);
    for (const type of expectedTypes) {
      expect(stats.requestsByType).toHaveProperty(type);
    }
  });

  it('includes all RequestType keys in amountsByType', async () => {
    const { db } = buildMockDb({ perTypeAmount: 5000 });
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    const expectedTypes = Object.values(RequestType);
    for (const type of expectedTypes) {
      expect(stats.amountsByType).toHaveProperty(type);
    }
  });

  it('stores correct per-type counts', async () => {
    const { db } = buildMockDb({ perTypeCount: 4, perTypeAmount: 20000 });
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    for (const type of Object.values(RequestType)) {
      expect(stats.requestsByType[type]).toBe(4);
      expect(stats.amountsByType[type]).toBe(20000);
    }
  });

  it('inserts a new row when no existing record for today', async () => {
    const { db, insertedRows } = buildMockDb({ existingRow: null });
    vi.mocked(drizzle).mockReturnValue(db as any);

    await aggregateStats(fakeD1());

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0];
    expect(row.date).toBe(new Date().toISOString().slice(0, 10));
    expect(typeof row.id).toBe('string');
    expect(row.id.length).toBeGreaterThan(0);
  });

  it('updates existing row when record for today already exists', async () => {
    const { db, insertedRows, updatedSets } = buildMockDb({
      existingRow: { id: 'existing-id-123' },
    });
    vi.mocked(drizzle).mockReturnValue(db as any);

    await aggregateStats(fakeD1());

    // Should update, not insert
    expect(insertedRows).toHaveLength(0);
    expect(updatedSets).toHaveLength(1);
  });

  it('stores requestsByType and amountsByType as JSON strings in the DB row', async () => {
    const { db, insertedRows } = buildMockDb({ existingRow: null, perTypeCount: 1, perTypeAmount: 1000 });
    vi.mocked(drizzle).mockReturnValue(db as any);

    await aggregateStats(fakeD1());

    const row = insertedRows[0];
    // Should be serializable JSON strings
    expect(() => JSON.parse(row.requestsByType)).not.toThrow();
    expect(() => JSON.parse(row.amountsByType)).not.toThrow();
  });

  it('handles null/zero DB results gracefully (defaults to 0)', async () => {
    // Simulate DB returning null totals
    const allRequestTypes = Object.values(RequestType);
    const sequence = [
      { total: null },       // totalReceived
      { count: null },       // requestsApproved
      { count: null },       // requestsRejected
      ...allRequestTypes.map(() => ({ count: null, total: null })),
      null,                  // no existing row
    ];

    let callIndex = 0;
    const insertedRows: any[] = [];
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockImplementation(() => {
        const result = sequence[callIndex] ?? null;
        callIndex++;
        return Promise.resolve(result);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockImplementation((vals: any) => {
        insertedRows.push(vals);
        return Promise.resolve();
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };

    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());

    expect(stats.totalReceived).toBe(0);
    expect(stats.totalDisbursed).toBe(0);
    expect(stats.requestsApproved).toBe(0);
    expect(stats.requestsRejected).toBe(0);
    for (const type of allRequestTypes) {
      expect(stats.requestsByType[type]).toBe(0);
      expect(stats.amountsByType[type]).toBe(0);
    }
  });

  it('does not include any student IDs or personal info in the returned stats', async () => {
    const { db } = buildMockDb({});
    vi.mocked(drizzle).mockReturnValue(db as any);

    const stats = await aggregateStats(fakeD1());
    const statsStr = JSON.stringify(stats);

    // No student-identifying fields should appear
    expect(statsStr).not.toContain('studentId');
    expect(statsStr).not.toContain('email');
    expect(statsStr).not.toContain('phone');
    expect(statsStr).not.toContain('firstName');
    expect(statsStr).not.toContain('lastName');
  });
});

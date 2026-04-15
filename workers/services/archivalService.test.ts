import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestStatus } from '../types';

// ---------------------------------------------------------------------------
// Mock drizzle-orm/d1 at module level (required for ESM)
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
  })),
}));

// Import AFTER mock is set up
import { ArchivalService } from './archivalService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<{ id: string; status: string; paidAt: Date | null }> = {}) {
  return {
    id: 'req-1',
    studentId: 'student-1',
    type: 'SCHOOL_FEES',
    amount: 1000,
    reason: 'test',
    status: RequestStatus.PAID,
    submittedAt: new Date(),
    paidAt: new Date(),
    archivedAt: null,
    rejectionReason: null,
    flagReason: null,
    reviewedAt: null,
    verifiedAt: null,
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// isEligibleForArchival
// ---------------------------------------------------------------------------

describe('ArchivalService.isEligibleForArchival', () => {
  const service = new ArchivalService();

  it('returns true for PAID request with paidAt 91 days ago', () => {
    expect(service.isEligibleForArchival({ status: RequestStatus.PAID, paidAt: daysAgo(91) })).toBe(true);
  });

  it('returns false for PAID request with paidAt 89 days ago', () => {
    expect(service.isEligibleForArchival({ status: RequestStatus.PAID, paidAt: daysAgo(89) })).toBe(false);
  });

  it('returns false for non-PAID status even if paidAt is old enough', () => {
    expect(service.isEligibleForArchival({ status: RequestStatus.APPROVED, paidAt: daysAgo(100) })).toBe(false);
  });

  it('returns false when paidAt is null', () => {
    expect(service.isEligibleForArchival({ status: RequestStatus.PAID, paidAt: null })).toBe(false);
  });

  it('returns false for ARCHIVED status', () => {
    expect(service.isEligibleForArchival({ status: RequestStatus.ARCHIVED, paidAt: daysAgo(100) })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateNotArchived
// ---------------------------------------------------------------------------

describe('ArchivalService.validateNotArchived', () => {
  const service = new ArchivalService();

  it('throws CANNOT_MODIFY_ARCHIVED_REQUEST for ARCHIVED status', () => {
    expect(() => service.validateNotArchived({ status: RequestStatus.ARCHIVED })).toThrow(
      'CANNOT_MODIFY_ARCHIVED_REQUEST'
    );
  });

  it('does not throw for PAID status', () => {
    expect(() => service.validateNotArchived({ status: RequestStatus.PAID })).not.toThrow();
  });

  it('does not throw for SUBMITTED status', () => {
    expect(() => service.validateNotArchived({ status: RequestStatus.SUBMITTED })).not.toThrow();
  });

  it('does not throw for APPROVED status', () => {
    expect(() => service.validateNotArchived({ status: RequestStatus.APPROVED })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// archiveEligibleRequests
// ---------------------------------------------------------------------------

describe('ArchivalService.archiveEligibleRequests', () => {
  it('archives eligible PAID requests and returns count + IDs', async () => {
    const service = new ArchivalService();
    const eligibleReq = makeRequest({ id: 'req-eligible', status: RequestStatus.PAID, paidAt: daysAgo(91) });

    // select chain for finding eligible requests
    const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue([eligibleReq]) };
    mockSelect.mockReturnValue(selectChain);

    // update chain
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue({}) };
    mockUpdate.mockReturnValue(updateChain);

    const prepareStmt = { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({}) };
    const fakeD1: any = { prepare: vi.fn().mockReturnValue(prepareStmt) };

    const result = await service.archiveEligibleRequests(fakeD1);

    expect(result.archivedCount).toBe(1);
    expect(result.requestIds).toContain('req-eligible');
    expect(mockUpdate).toHaveBeenCalled();
    expect(fakeD1.prepare).toHaveBeenCalled();
  });

  it('returns zero count when no eligible requests exist', async () => {
    const service = new ArchivalService();

    const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue(selectChain);

    const fakeD1: any = { prepare: vi.fn() };

    const result = await service.archiveEligibleRequests(fakeD1);

    expect(result.archivedCount).toBe(0);
    expect(result.requestIds).toHaveLength(0);
    expect(fakeD1.prepare).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// searchArchivedRequests
// ---------------------------------------------------------------------------

describe('ArchivalService.searchArchivedRequests', () => {
  it('returns paginated archived requests with associations', async () => {
    const service = new ArchivalService();
    const archivedReq = makeRequest({ id: 'req-arch', status: RequestStatus.ARCHIVED });

    // First call: main query; subsequent calls: docs, comments, statusChanges per request
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      all: vi.fn()
        .mockResolvedValueOnce([archivedReq])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const fakeD1: any = {};
    const result = await service.searchArchivedRequests(fakeD1, { page: 1, limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('req-arch');
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.page).toBe(1);
  });

  it('applies pagination correctly', async () => {
    const service = new ArchivalService();
    const reqs = ['a', 'b', 'c'].map((id) => makeRequest({ id: `req-${id}`, status: RequestStatus.ARCHIVED }));

    // page 2, limit 2 → only req-c is returned
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      all: vi.fn()
        .mockResolvedValueOnce(reqs)  // main query returns all 3
        .mockResolvedValueOnce([])    // docs for req-c
        .mockResolvedValueOnce([])    // comments for req-c
        .mockResolvedValueOnce([]),   // history for req-c
    };
    mockSelect.mockReturnValue(selectChain);

    const fakeD1: any = {};
    const result = await service.searchArchivedRequests(fakeD1, { page: 2, limit: 2 });

    expect(result.items).toHaveLength(1);
    expect(result.pagination.totalPages).toBe(2);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getArchivedRequestById
// ---------------------------------------------------------------------------

describe('ArchivalService.getArchivedRequestById', () => {
  it('returns full archived request with associations', async () => {
    const service = new ArchivalService();
    const archivedReq = makeRequest({ id: 'req-1', status: RequestStatus.ARCHIVED });

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(archivedReq),
      all: vi.fn()
        .mockResolvedValueOnce([{ id: 'doc-1' }])
        .mockResolvedValueOnce([{ id: 'cmt-1' }])
        .mockResolvedValueOnce([{ id: 'sc-1' }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const fakeD1: any = {};
    const result = await service.getArchivedRequestById(fakeD1, 'req-1');

    expect(result.id).toBe('req-1');
    expect(result.documents).toHaveLength(1);
    expect(result.comments).toHaveLength(1);
    expect(result.statusHistory).toHaveLength(1);
  });

  it('throws REQUEST_NOT_FOUND when request does not exist', async () => {
    const service = new ArchivalService();

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(undefined),
    };
    mockSelect.mockReturnValue(selectChain);

    const fakeD1: any = {};
    await expect(service.getArchivedRequestById(fakeD1, 'missing')).rejects.toThrow('REQUEST_NOT_FOUND');
  });

  it('throws REQUEST_NOT_ARCHIVED when request is not archived', async () => {
    const service = new ArchivalService();
    const paidReq = makeRequest({ id: 'req-paid', status: RequestStatus.PAID });

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(paidReq),
    };
    mockSelect.mockReturnValue(selectChain);

    const fakeD1: any = {};
    await expect(service.getArchivedRequestById(fakeD1, 'req-paid')).rejects.toThrow('REQUEST_NOT_ARCHIVED');
  });
});

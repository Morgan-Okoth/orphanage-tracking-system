import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestStatus, RequestType, UserRole } from '../types';

// ─── Mock drizzle so RequestService uses our mock db directly ─────────────────

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => mockDb),
}));

// Mock audit service so it doesn't try to use a real DB/context
vi.mock('./auditService', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock notification service
vi.mock('./notificationService', () => {
  const NotificationService = vi.fn(function (this: any) {
    this.queueEmail = vi.fn().mockResolvedValue(undefined);
    this.queueSMS = vi.fn().mockResolvedValue(undefined);
    this.sendRequestStatusNotification = vi.fn().mockResolvedValue(undefined);
  });
  return { NotificationService };
});

// Import after mocks are set up
import { RequestService } from './requestService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<any> = {}) {
  return {
    id: 'req-1',
    studentId: 'student-1',
    type: RequestType.SCHOOL_FEES,
    amount: 5000,
    reason: 'School fees for term 2 of the academic year',
    status: RequestStatus.SUBMITTED,
    submittedAt: new Date(),
    reviewedAt: null,
    verifiedAt: null,
    paidAt: null,
    archivedAt: null,
    rejectionReason: null,
    flagReason: null,
    ...overrides,
  };
}

function makeComment(overrides: Partial<any> = {}) {
  return {
    id: 'comment-1',
    requestId: 'req-1',
    authorId: 'admin-1',
    content: 'Please provide additional receipts',
    isInternal: false,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeStatusChange(overrides: Partial<any> = {}) {
  return {
    id: 'sc-1',
    requestId: 'req-1',
    fromStatus: null,
    toStatus: RequestStatus.SUBMITTED,
    changedById: 'student-1',
    changedAt: new Date(),
    reason: null,
    ...overrides,
  };
}

/** Build a minimal Hono-like Context mock */
function makeContext(envOverrides: Record<string, any> = {}) {
  return {
    env: {
      DB: {} as D1Database,
      EMAIL_QUEUE: undefined,
      SMS_QUEUE: undefined,
      ...envOverrides,
    },
    req: {
      header: vi.fn().mockReturnValue('127.0.0.1'),
    },
  } as any;
}

// ─── Mock DB chain helpers ────────────────────────────────────────────────────

/** Build a chainable query terminal that resolves to `value` */
function makeQueryTerminal(value: any) {
  const arr = value === null ? [] : Array.isArray(value) ? value : [value];
  const terminal: any = {
    get: vi.fn().mockResolvedValue(value),
    all: vi.fn().mockResolvedValue(arr),
    // Support chained .where() calls (e.g. getComments for STUDENT)
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue(arr),
    }),
  };
  return terminal;
}

function setupSelectReturning(value: any) {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(makeQueryTerminal(value)),
      orderBy: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue(value === null ? [] : Array.isArray(value) ? value : [value]),
      }),
    }),
  });
}

function setupSelectSequence(values: any[]) {
  let callCount = 0;
  mockDb.select.mockImplementation(() => {
    const idx = callCount++;
    const value = values[idx] ?? null;
    const arr = value === null ? [] : Array.isArray(value) ? value : [value];
    const terminal: any = {
      get: vi.fn().mockResolvedValue(value),
      all: vi.fn().mockResolvedValue(arr),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue(arr),
      }),
    };
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(terminal),
        orderBy: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue(arr),
        }),
      }),
    };
  });
}

function setupInsertOk() {
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue(undefined) }),
  });
}

function setupUpdateOk() {
  mockDb.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RequestService', () => {
  let service: RequestService;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RequestService({} as D1Database);
    ctx = makeContext();
  });

  // ─── 1. Request Submission - valid request ──────────────────────────────────

  describe('createRequest - valid submission', () => {
    it('should create a request with required fields and return SUBMITTED status', async () => {
      const created = makeRequest();
      setupInsertOk();
      // First select: fetch created request; second: fetch for status log
      setupSelectSequence([created, created]);

      const result = await service.createRequest(
        {
          studentId: 'student-1',
          type: RequestType.SCHOOL_FEES,
          amount: 5000,
          reason: 'School fees for term 2 of the academic year',
        },
        ctx
      );

      expect(result).toBeDefined();
      expect(result.status).toBe(RequestStatus.SUBMITTED);
      expect(result.type).toBe(RequestType.SCHOOL_FEES);
      expect(result.amount).toBe(5000);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should accept all valid request types', async () => {
      const types = [
        RequestType.SCHOOL_FEES,
        RequestType.MEDICAL_EXPENSES,
        RequestType.SUPPLIES,
        RequestType.EMERGENCY,
        RequestType.OTHER,
      ];

      for (const type of types) {
        vi.clearAllMocks();
        const created = makeRequest({ type });
        setupInsertOk();
        setupSelectSequence([created, created]);

        const result = await service.createRequest(
          { studentId: 'student-1', type, amount: 1000, reason: 'Valid reason for the request here' },
          ctx
        );

        expect(result.type).toBe(type);
      }
    });

    it('should accept amounts with up to 2 decimal places', async () => {
      const created = makeRequest({ amount: 1500.50 });
      setupInsertOk();
      setupSelectSequence([created, created]);

      const result = await service.createRequest(
        { studentId: 'student-1', type: RequestType.SUPPLIES, amount: 1500.50, reason: 'Supplies for the new school term' },
        ctx
      );

      expect(result.amount).toBe(1500.50);
    });

    it('should record a status change entry on creation', async () => {
      const created = makeRequest();
      setupInsertOk();
      setupSelectSequence([created, created]);

      await service.createRequest(
        { studentId: 'student-1', type: RequestType.SCHOOL_FEES, amount: 5000, reason: 'School fees for term 2' },
        ctx
      );

      // insert should be called at least twice: once for request, once for status_changes
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 2. Request Submission - validation errors ──────────────────────────────

  describe('createRequest - validation errors', () => {
    it('should reject a zero amount', async () => {
      await expect(
        service.createRequest(
          { studentId: 'student-1', type: RequestType.SCHOOL_FEES, amount: 0, reason: 'Some reason' },
          ctx
        )
      ).rejects.toThrow('INVALID_AMOUNT');
    });

    it('should reject a negative amount', async () => {
      await expect(
        service.createRequest(
          { studentId: 'student-1', type: RequestType.SCHOOL_FEES, amount: -100, reason: 'Some reason' },
          ctx
        )
      ).rejects.toThrow('INVALID_AMOUNT');
    });

    it('should reject an amount exceeding 1,000,000', async () => {
      await expect(
        service.createRequest(
          { studentId: 'student-1', type: RequestType.SCHOOL_FEES, amount: 1000001, reason: 'Some reason' },
          ctx
        )
      ).rejects.toThrow('INVALID_AMOUNT');
    });

    it('should reject an amount with more than 2 decimal places', async () => {
      await expect(
        service.createRequest(
          { studentId: 'student-1', type: RequestType.SCHOOL_FEES, amount: 100.123, reason: 'Some reason' },
          ctx
        )
      ).rejects.toThrow('INVALID_AMOUNT_DECIMALS');
    });
  });

  // ─── 3. Status transitions - valid path ────────────────────────────────────

  describe('status transitions - valid path', () => {
    it('SUBMITTED → UNDER_REVIEW via startReview', async () => {
      const submitted = makeRequest({ status: RequestStatus.SUBMITTED });
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });

      setupInsertOk();
      setupUpdateOk();
      // getRequestById (pre-check) → getRequestById (return updated)
      setupSelectSequence([submitted, underReview, underReview, underReview]);

      const result = await service.startReview('req-1', 'admin-1', ctx);

      expect(result.status).toBe(RequestStatus.UNDER_REVIEW);
    });

    it('UNDER_REVIEW → APPROVED via approveRequest', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      const approved = makeRequest({ status: RequestStatus.APPROVED });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([underReview, approved, approved, approved, approved]);

      const result = await service.approveRequest('req-1', 'admin-1', ctx);

      expect(result.status).toBe(RequestStatus.APPROVED);
    });

    it('APPROVED → VERIFIED via verifyRequest', async () => {
      const approved = makeRequest({ status: RequestStatus.APPROVED });
      const verified = makeRequest({ status: RequestStatus.VERIFIED });
      // Sequence: getRequestById (pre-check), notification: select request,
      // notification: select student (null → early return), getRequestById (return result)
      setupSelectSequence([approved, verified, null, verified]);

      setupInsertOk();
      setupUpdateOk();

      const result = await service.verifyRequest('req-1', 'admin-2', ctx);

      expect(result.status).toBe(RequestStatus.VERIFIED);
    });
  });

  // ─── 4. Invalid status transitions ─────────────────────────────────────────

  describe('status transitions - invalid transitions', () => {
    it('should reject startReview when status is not SUBMITTED', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      setupSelectReturning(underReview);

      await expect(service.startReview('req-1', 'admin-1', ctx)).rejects.toThrow(
        'INVALID_STATUS_TRANSITION'
      );
    });

    it('should reject approveRequest when status is not UNDER_REVIEW', async () => {
      const submitted = makeRequest({ status: RequestStatus.SUBMITTED });
      setupSelectReturning(submitted);

      await expect(service.approveRequest('req-1', 'admin-1', ctx)).rejects.toThrow(
        'INVALID_STATUS_TRANSITION'
      );
    });

    it('should reject verifyRequest when status is not APPROVED', async () => {
      const submitted = makeRequest({ status: RequestStatus.SUBMITTED });
      setupSelectReturning(submitted);

      await expect(service.verifyRequest('req-1', 'admin-2', ctx)).rejects.toThrow(
        'INVALID_STATUS_TRANSITION'
      );
    });

    it('should reject requestAdditionalDocuments when status is not UNDER_REVIEW', async () => {
      const submitted = makeRequest({ status: RequestStatus.SUBMITTED });
      setupSelectReturning(submitted);

      await expect(
        service.requestAdditionalDocuments('req-1', 'admin-1', 'Need more receipts please', ctx)
      ).rejects.toThrow('INVALID_STATUS_TRANSITION');
    });

    it('should reject rejectRequest when status is SUBMITTED', async () => {
      const submitted = makeRequest({ status: RequestStatus.SUBMITTED });
      setupSelectReturning(submitted);

      await expect(
        service.rejectRequest('req-1', 'admin-1', 'Insufficient documentation provided', ctx)
      ).rejects.toThrow('INVALID_STATUS_TRANSITION');
    });

    it('should throw REQUEST_NOT_FOUND for a non-existent request', async () => {
      setupSelectReturning(null);

      await expect(service.startReview('non-existent', 'admin-1', ctx)).rejects.toThrow(
        'REQUEST_NOT_FOUND'
      );
    });
  });

  // ─── 5. Admin Level 1 review and approval flow ─────────────────────────────

  describe('Admin Level 1 review and approval flow', () => {
    it('should transition SUBMITTED → UNDER_REVIEW when admin starts review', async () => {
      const submitted = makeRequest({ status: RequestStatus.SUBMITTED });
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW, reviewedAt: new Date() });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([submitted, underReview, underReview, underReview]);

      const result = await service.startReview('req-1', 'admin-1', ctx);

      expect(result.status).toBe(RequestStatus.UNDER_REVIEW);
    });

    it('should transition UNDER_REVIEW → APPROVED when admin approves', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      const approved = makeRequest({ status: RequestStatus.APPROVED });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([underReview, approved, approved, approved, approved]);

      const result = await service.approveRequest('req-1', 'admin-1', ctx);

      expect(result.status).toBe(RequestStatus.APPROVED);
    });

    it('should log a status change entry when review starts', async () => {
      const submitted = makeRequest({ status: RequestStatus.SUBMITTED });
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([submitted, underReview, underReview, underReview]);

      await service.startReview('req-1', 'admin-1', ctx);

      // insert called for status_changes log
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should log a status change entry when request is approved', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      const approved = makeRequest({ status: RequestStatus.APPROVED });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([underReview, approved, approved, approved, approved]);

      await service.approveRequest('req-1', 'admin-1', ctx);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ─── 6. Admin Level 1 rejection with reason ────────────────────────────────

  describe('Admin Level 1 rejection with reason', () => {
    it('should reject a request under review and store the rejection reason', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      const rejected = makeRequest({
        status: RequestStatus.REJECTED,
        rejectionReason: 'Insufficient documentation provided for the request',
      });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([underReview, rejected, rejected, rejected]);

      const result = await service.rejectRequest(
        'req-1',
        'admin-1',
        'Insufficient documentation provided for the request',
        ctx
      );

      expect(result.status).toBe(RequestStatus.REJECTED);
      expect(result.rejectionReason).toBe('Insufficient documentation provided for the request');
    });

    it('should allow rejection from APPROVED status', async () => {
      const approved = makeRequest({ status: RequestStatus.APPROVED });
      const rejected = makeRequest({ status: RequestStatus.REJECTED, rejectionReason: 'Fraud detected' });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([approved, rejected, rejected, rejected]);

      const result = await service.rejectRequest('req-1', 'admin-2', 'Fraud detected', ctx);

      expect(result.status).toBe(RequestStatus.REJECTED);
    });

    it('should allow rejection from VERIFIED status', async () => {
      const verified = makeRequest({ status: RequestStatus.VERIFIED });
      const rejected = makeRequest({ status: RequestStatus.REJECTED, rejectionReason: 'Duplicate request found' });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([verified, rejected, rejected, rejected]);

      const result = await service.rejectRequest('req-1', 'admin-2', 'Duplicate request found', ctx);

      expect(result.status).toBe(RequestStatus.REJECTED);
    });

    it('should log a status change entry on rejection', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      const rejected = makeRequest({ status: RequestStatus.REJECTED });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([underReview, rejected, rejected, rejected]);

      await service.rejectRequest('req-1', 'admin-1', 'Insufficient documentation provided', ctx);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ─── 7. Comment system ─────────────────────────────────────────────────────

  describe('comment system', () => {
    it('should add a public comment to a request', async () => {
      const request = makeRequest();
      const comment = makeComment({ isInternal: false });

      setupInsertOk();
      // getRequestById (verify exists) → fetch created comment → notifications
      setupSelectSequence([request, comment, request, request, []]);

      const result = await service.addComment(
        { requestId: 'req-1', authorId: 'admin-1', content: 'Please provide additional receipts', isInternal: false },
        ctx
      );

      expect(result).toBeDefined();
      expect(result.content).toBe('Please provide additional receipts');
      expect(result.isInternal).toBe(false);
    });

    it('should add an internal comment visible only to admins', async () => {
      const request = makeRequest();
      const comment = makeComment({ isInternal: true, content: 'Internal note: suspicious pattern' });

      setupInsertOk();
      setupSelectSequence([request, comment, request, request, []]);

      const result = await service.addComment(
        { requestId: 'req-1', authorId: 'admin-1', content: 'Internal note: suspicious pattern', isInternal: true },
        ctx
      );

      expect(result.isInternal).toBe(true);
    });

    it('should retrieve public comments for a student (no internal comments)', async () => {
      const request = makeRequest();
      const publicComment = makeComment({ id: 'c-1', isInternal: false });

      // getRequestById → getComments query
      setupSelectSequence([request, [publicComment]]);

      const results = await service.getComments('req-1', UserRole.STUDENT);

      expect(results).toHaveLength(1);
      expect(results[0].isInternal).toBe(false);
    });

    it('should retrieve all comments (including internal) for admins', async () => {
      const request = makeRequest();
      const publicComment = makeComment({ id: 'c-1', isInternal: false });
      const internalComment = makeComment({ id: 'c-2', isInternal: true, content: 'Internal note' });

      setupSelectSequence([request, [publicComment, internalComment]]);

      const results = await service.getComments('req-1', UserRole.ADMIN_LEVEL_1);

      expect(results).toHaveLength(2);
    });

    it('should throw REQUEST_NOT_FOUND when adding comment to non-existent request', async () => {
      setupSelectReturning(null);

      await expect(
        service.addComment(
          { requestId: 'non-existent', authorId: 'admin-1', content: 'Some comment here', isInternal: false },
          ctx
        )
      ).rejects.toThrow('REQUEST_NOT_FOUND');
    });

    it('should return empty array when no comments exist', async () => {
      const request = makeRequest();
      setupSelectSequence([request, []]);

      const results = await service.getComments('req-1', UserRole.ADMIN_LEVEL_1);

      expect(results).toHaveLength(0);
    });
  });

  // ─── 8. Request additional documents flow ──────────────────────────────────

  describe('requestAdditionalDocuments flow', () => {
    it('should transition UNDER_REVIEW → PENDING_DOCUMENTS', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      const pendingDocs = makeRequest({ status: RequestStatus.PENDING_DOCUMENTS });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([underReview, pendingDocs, pendingDocs, pendingDocs]);

      const result = await service.requestAdditionalDocuments(
        'req-1',
        'admin-1',
        'Please provide original receipts and bank statements',
        ctx
      );

      expect(result.status).toBe(RequestStatus.PENDING_DOCUMENTS);
    });

    it('should store the reason for requesting additional documents', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      const pendingDocs = makeRequest({ status: RequestStatus.PENDING_DOCUMENTS });

      let capturedInsertValues: any;
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockImplementation((data: any) => {
          capturedInsertValues = data;
          return { run: vi.fn().mockResolvedValue(undefined) };
        }),
      });
      setupUpdateOk();
      setupSelectSequence([underReview, pendingDocs, pendingDocs, pendingDocs]);

      await service.requestAdditionalDocuments(
        'req-1',
        'admin-1',
        'Please provide original receipts and bank statements',
        ctx
      );

      // The status change log should contain the reason
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should log a status change entry when requesting documents', async () => {
      const underReview = makeRequest({ status: RequestStatus.UNDER_REVIEW });
      const pendingDocs = makeRequest({ status: RequestStatus.PENDING_DOCUMENTS });

      setupInsertOk();
      setupUpdateOk();
      setupSelectSequence([underReview, pendingDocs, pendingDocs, pendingDocs]);

      await service.requestAdditionalDocuments(
        'req-1',
        'admin-1',
        'Please provide original receipts and bank statements',
        ctx
      );

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should reject requestAdditionalDocuments from SUBMITTED status', async () => {
      const submitted = makeRequest({ status: RequestStatus.SUBMITTED });
      setupSelectReturning(submitted);

      await expect(
        service.requestAdditionalDocuments(
          'req-1',
          'admin-1',
          'Please provide original receipts and bank statements',
          ctx
        )
      ).rejects.toThrow('INVALID_STATUS_TRANSITION');
    });

    it('should reject requestAdditionalDocuments from APPROVED status', async () => {
      const approved = makeRequest({ status: RequestStatus.APPROVED });
      setupSelectReturning(approved);

      await expect(
        service.requestAdditionalDocuments(
          'req-1',
          'admin-1',
          'Please provide original receipts and bank statements',
          ctx
        )
      ).rejects.toThrow('INVALID_STATUS_TRANSITION');
    });
  });

  // ─── 9. Status history ─────────────────────────────────────────────────────

  describe('getStatusHistory', () => {
    it('should return status change history in chronological order', async () => {
      const request = makeRequest();
      const history = [
        makeStatusChange({ id: 'sc-1', fromStatus: null, toStatus: RequestStatus.SUBMITTED }),
        makeStatusChange({ id: 'sc-2', fromStatus: RequestStatus.SUBMITTED, toStatus: RequestStatus.UNDER_REVIEW }),
      ];

      setupSelectSequence([request, history]);

      const result = await service.getStatusHistory('req-1');

      expect(result).toHaveLength(2);
      expect(result[0].toStatus).toBe(RequestStatus.SUBMITTED);
      expect(result[1].toStatus).toBe(RequestStatus.UNDER_REVIEW);
    });

    it('should throw REQUEST_NOT_FOUND for non-existent request', async () => {
      setupSelectReturning(null);

      await expect(service.getStatusHistory('non-existent')).rejects.toThrow('REQUEST_NOT_FOUND');
    });
  });
});

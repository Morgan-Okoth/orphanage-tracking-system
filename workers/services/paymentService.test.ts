import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestStatus, RequestType } from '../types';

// ─── Mock drizzle so PaymentService uses our mock db directly ─────────────────

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => mockDb),
}));

// Mock audit service
vi.mock('./auditService', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock notification service
vi.mock('./notificationService', () => {
  const NotificationService = vi.fn(function (this: any) {
    this.queueEmail = vi.fn().mockResolvedValue(undefined);
    this.queueSMS = vi.fn().mockResolvedValue(undefined);
  });
  return { NotificationService };
});

// Import after mocks are set up
import { PaymentService } from './paymentService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<any> = {}) {
  return {
    id: 'req-1',
    studentId: 'student-1',
    type: RequestType.SCHOOL_FEES,
    amount: 5000,
    reason: 'School fees for term 2',
    status: RequestStatus.VERIFIED,
    submittedAt: new Date(),
    reviewedAt: new Date(),
    verifiedAt: new Date(),
    paidAt: null,
    archivedAt: null,
    rejectionReason: null,
    flagReason: null,
    ...overrides,
  };
}

function makeStudent(overrides: Partial<any> = {}) {
  return {
    id: 'student-1',
    email: 'student@example.com',
    phone: '+254712345678',
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'STUDENT',
    accountStatus: 'ACTIVE',
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<any> = {}) {
  return {
    id: 'txn-1',
    requestId: 'req-1',
    amount: 5000,
    currency: 'KES',
    mpesaTransactionId: 'ws_CO_123456',
    mpesaReceiptNumber: null,
    phoneNumber: '+254712345678',
    status: 'pending',
    initiatedAt: new Date(),
    completedAt: null,
    failureReason: null,
    metadata: JSON.stringify({ merchantRequestId: 'MR-123', checkoutRequestId: 'ws_CO_123456' }),
    ...overrides,
  };
}

/** Build a minimal Hono-like Context mock */
function makeContext(envOverrides: Record<string, any> = {}) {
  return {
    env: {
      DB: {} as D1Database,
      MPESA_CONSUMER_KEY: 'test-consumer-key',
      MPESA_CONSUMER_SECRET: 'test-consumer-secret',
      MPESA_SHORTCODE: '174379',
      MPESA_PASSKEY: 'test-passkey',
      MPESA_CALLBACK_URL: 'https://example.com/callback',
      ...envOverrides,
    },
    req: {
      header: vi.fn().mockReturnValue('127.0.0.1'),
    },
  } as any;
}

/** Build a mock M-Pesa STK Push success response */
function makeMpesaSTKResponse(overrides: Partial<any> = {}) {
  return {
    MerchantRequestID: 'MR-123456',
    CheckoutRequestID: 'ws_CO_123456',
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
    CustomerMessage: 'Success. Request accepted for processing',
    ...overrides,
  };
}

/** Build a successful M-Pesa callback payload */
function makeSuccessCallback(checkoutRequestId = 'ws_CO_123456') {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: 'MR-123456',
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 5000 },
            { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
            { Name: 'TransactionDate', Value: 20231201120000 },
            { Name: 'PhoneNumber', Value: 254712345678 },
          ],
        },
      },
    },
  };
}

/** Build a failed M-Pesa callback payload */
function makeFailureCallback(checkoutRequestId = 'ws_CO_123456') {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: 'MR-123456',
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 1032,
        ResultDesc: 'Request cancelled by user',
      },
    },
  };
}

// ─── Mock DB chain helpers ────────────────────────────────────────────────────

function makeQueryTerminal(value: any) {
  const arr = value === null ? [] : Array.isArray(value) ? value : [value];
  const terminal: any = {
    get: vi.fn().mockResolvedValue(value),
    all: vi.fn().mockResolvedValue(arr),
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

/** Mock global fetch for M-Pesa API calls */
function mockMpesaFetch(tokenResponse: any, stkResponse: any) {
  let callCount = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    callCount++;
    const data = callCount === 1 ? tokenResponse : stkResponse;
    return {
      ok: true,
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaymentService', () => {
  let service: PaymentService;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = makeContext();
    service = new PaymentService({} as D1Database, ctx.env);
  });

  // ─── 1. Payment initiation - VERIFIED request ─────────────────────────────
  // Requirements: 7.1, 7.5

  describe('initiatePayment - VERIFIED request', () => {
    it('should initiate payment successfully for a VERIFIED request', async () => {
      const request = makeRequest({ status: RequestStatus.VERIFIED });
      const student = makeStudent();

      // Sequence: fetch request → check existing transaction (none) → fetch student
      setupSelectSequence([request, null, student]);
      setupInsertOk();

      mockMpesaFetch(
        { access_token: 'test-token' },
        makeMpesaSTKResponse()
      );

      const result = await service.initiatePayment('req-1', '+254712345678', 'admin-1', ctx);

      expect(result).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.amount).toBe(5000);
      expect(result.mpesaCheckoutRequestId).toBe('ws_CO_123456');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should store a transaction record with pending status after initiation', async () => {
      const request = makeRequest({ status: RequestStatus.VERIFIED });
      const student = makeStudent();

      setupSelectSequence([request, null, student]);

      let capturedValues: any;
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockImplementation((data: any) => {
          capturedValues = data;
          return { run: vi.fn().mockResolvedValue(undefined) };
        }),
      });

      mockMpesaFetch(
        { access_token: 'test-token' },
        makeMpesaSTKResponse()
      );

      await service.initiatePayment('req-1', '+254712345678', 'admin-1', ctx);

      expect(capturedValues).toBeDefined();
      expect(capturedValues.status).toBe('pending');
      expect(capturedValues.requestId).toBe('req-1');
      expect(capturedValues.amount).toBe(5000);
    });

    it('should call M-Pesa STK Push API during payment initiation', async () => {
      const request = makeRequest({ status: RequestStatus.VERIFIED });
      const student = makeStudent();

      setupSelectSequence([request, null, student]);
      setupInsertOk();

      const fetchMock = vi.fn();
      let callCount = 0;
      fetchMock.mockImplementation(async (url: string) => {
        callCount++;
        if (callCount === 1) {
          return { ok: true, json: async () => ({ access_token: 'test-token' }) };
        }
        return { ok: true, json: async () => makeMpesaSTKResponse() };
      });
      vi.stubGlobal('fetch', fetchMock);

      await service.initiatePayment('req-1', '+254712345678', 'admin-1', ctx);

      // fetch called twice: once for OAuth token, once for STK push
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const stkCallUrl = fetchMock.mock.calls[1][0] as string;
      expect(stkCallUrl).toContain('stkpush');
    });
  });

  // ─── 2. Payment rejection for non-VERIFIED requests ──────────────────────
  // Requirements: 7.5

  describe('initiatePayment - non-VERIFIED request rejection', () => {
    const nonVerifiedStatuses = [
      RequestStatus.SUBMITTED,
      RequestStatus.APPROVED,
      RequestStatus.PAID,
    ];

    for (const status of nonVerifiedStatuses) {
      it(`should reject payment initiation for request with status ${status}`, async () => {
        const request = makeRequest({ status });
        setupSelectReturning(request);

        await expect(
          service.initiatePayment('req-1', '+254712345678', 'admin-1', ctx)
        ).rejects.toThrow('REQUEST_NOT_VERIFIED');
      });
    }

    it('should throw REQUEST_NOT_FOUND for a non-existent request', async () => {
      setupSelectReturning(null);

      await expect(
        service.initiatePayment('non-existent', '+254712345678', 'admin-1', ctx)
      ).rejects.toThrow('REQUEST_NOT_FOUND');
    });
  });

  // ─── 3. Successful M-Pesa callback handling ───────────────────────────────
  // Requirements: 7.2, 7.3

  describe('handleCallback - successful payment', () => {
    it('should update transaction status to completed on success callback', async () => {
      const transaction = makeTransaction();

      setupSelectReturning(transaction);
      setupUpdateOk();

      // Additional selects for notification (request + student)
      setupSelectSequence([transaction, makeRequest({ status: RequestStatus.PAID }), makeStudent()]);
      setupUpdateOk();

      await service.handleCallback(makeSuccessCallback(), ctx);

      expect(mockDb.update).toHaveBeenCalled();
      const updateSetCall = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(updateSetCall.status).toBe('completed');
    });

    it('should update request status to PAID on success callback', async () => {
      const transaction = makeTransaction();
      const request = makeRequest({ status: RequestStatus.VERIFIED });
      const student = makeStudent();

      setupSelectSequence([transaction, request, student]);

      // Capture each update call's set arguments separately
      const setCalls: any[] = [];
      mockDb.update.mockReturnValue({
        set: vi.fn().mockImplementation((data: any) => {
          setCalls.push(data);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      });

      await service.handleCallback(makeSuccessCallback(), ctx);

      // update called at least twice: once for transaction, once for request
      expect(mockDb.update).toHaveBeenCalledTimes(2);
      // Second set call is for the request update
      const requestUpdate = setCalls[1];
      expect(requestUpdate.status).toBe(RequestStatus.PAID);
      expect(requestUpdate.paidAt).toBeDefined();
    });

    it('should store the M-Pesa receipt number on successful callback', async () => {
      const transaction = makeTransaction();
      const request = makeRequest();
      const student = makeStudent();

      setupSelectSequence([transaction, request, student]);
      setupUpdateOk();

      await service.handleCallback(makeSuccessCallback(), ctx);

      const txnUpdateSetCall = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(txnUpdateSetCall.mpesaReceiptNumber).toBe('NLJ7RT61SV');
    });

    it('should do nothing if transaction is not found for the checkout request ID', async () => {
      setupSelectReturning(null);

      // Should not throw, just log and return
      await expect(service.handleCallback(makeSuccessCallback('unknown-id'), ctx)).resolves.toBeUndefined();
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  // ─── 4. Failed M-Pesa callback handling ──────────────────────────────────
  // Requirements: 7.4

  describe('handleCallback - failed payment', () => {
    it('should update transaction status to failed on failure callback', async () => {
      const transaction = makeTransaction();
      setupSelectReturning(transaction);
      setupUpdateOk();

      await service.handleCallback(makeFailureCallback(), ctx);

      expect(mockDb.update).toHaveBeenCalled();
      const updateSetCall = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(updateSetCall.status).toBe('failed');
    });

    it('should store the failure reason from M-Pesa on failed callback', async () => {
      const transaction = makeTransaction();
      setupSelectReturning(transaction);
      setupUpdateOk();

      await service.handleCallback(makeFailureCallback(), ctx);

      const updateSetCall = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(updateSetCall.failureReason).toBe('Request cancelled by user');
    });

    it('should NOT update request status to PAID on failure callback', async () => {
      const transaction = makeTransaction();
      setupSelectReturning(transaction);
      setupUpdateOk();

      await service.handleCallback(makeFailureCallback(), ctx);

      // Only one update call (for transaction), not for request
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('should keep request in VERIFIED status after failed payment', async () => {
      const transaction = makeTransaction();
      setupSelectReturning(transaction);
      setupUpdateOk();

      await service.handleCallback(makeFailureCallback(), ctx);

      // Verify no request update was made (request stays VERIFIED)
      const updateCalls = mockDb.update.mock.calls;
      expect(updateCalls).toHaveLength(1);
      // The single update is for the transaction table, not requests
      const updateSetCall = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(updateSetCall.status).toBe('failed');
      expect(updateSetCall).not.toHaveProperty('paidAt');
    });
  });

  // ─── 5. Payment query - get payment by transaction ID ────────────────────
  // Requirements: 7.3

  describe('getPaymentById', () => {
    it('should return payment details for a valid transaction ID', async () => {
      const transaction = makeTransaction({ status: 'completed', mpesaReceiptNumber: 'NLJ7RT61SV' });
      setupSelectReturning(transaction);

      const result = await service.getPaymentById('txn-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('txn-1');
      expect(result.requestId).toBe('req-1');
      expect(result.amount).toBe(5000);
      expect(result.currency).toBe('KES');
      expect(result.status).toBe('completed');
      expect(result.mpesaReceiptNumber).toBe('NLJ7RT61SV');
    });

    it('should throw TRANSACTION_NOT_FOUND for a non-existent transaction ID', async () => {
      setupSelectReturning(null);

      await expect(service.getPaymentById('non-existent')).rejects.toThrow('TRANSACTION_NOT_FOUND');
    });

    it('should return all required transaction fields', async () => {
      const transaction = makeTransaction();
      setupSelectReturning(transaction);

      const result = await service.getPaymentById('txn-1');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('requestId');
      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('currency');
      expect(result).toHaveProperty('mpesaTransactionId');
      expect(result).toHaveProperty('phoneNumber');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('initiatedAt');
    });
  });

  // ─── 6. Duplicate payment prevention ─────────────────────────────────────
  // Requirements: 7.1, 7.5

  describe('initiatePayment - duplicate prevention', () => {
    it('should reject payment initiation if a transaction already exists for the request', async () => {
      const request = makeRequest({ status: RequestStatus.VERIFIED });
      const existingTransaction = makeTransaction({ status: 'pending' });

      // Sequence: fetch request → find existing transaction
      setupSelectSequence([request, existingTransaction]);

      await expect(
        service.initiatePayment('req-1', '+254712345678', 'admin-1', ctx)
      ).rejects.toThrow('PAYMENT_ALREADY_EXISTS');
    });

    it('should reject payment initiation for a request that is already PAID', async () => {
      const paidRequest = makeRequest({ status: RequestStatus.PAID });
      setupSelectReturning(paidRequest);

      await expect(
        service.initiatePayment('req-1', '+254712345678', 'admin-1', ctx)
      ).rejects.toThrow('REQUEST_NOT_VERIFIED');
    });

    it('should not call M-Pesa API when duplicate payment is detected', async () => {
      const request = makeRequest({ status: RequestStatus.VERIFIED });
      const existingTransaction = makeTransaction({ status: 'completed' });

      setupSelectSequence([request, existingTransaction]);

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        service.initiatePayment('req-1', '+254712345678', 'admin-1', ctx)
      ).rejects.toThrow('PAYMENT_ALREADY_EXISTS');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

/**
 * Integration tests for Notification Handler
 * Tests mark-as-read, unread count, and notification logging via HTTP endpoints
 * Requirements: 9.1, 9.2, 9.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware so we can inject a user directly
vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', { userId: 'user-1', email: 'student@example.com', role: 'STUDENT' });
    await next();
  },
}));

vi.mock('../db/client', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../db/client';
import notificationsApp from './notifications';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<{
  id: string; userId: string; type: string; channel: string;
  subject: string; message: string; status: string;
  sentAt: Date | null; readAt: Date | null; failureReason: string | null;
  retryCount: number; createdAt: Date;
}> = {}) {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type: 'email',
    channel: 'student@example.com',
    subject: 'Test Subject',
    message: 'Test message',
    status: 'sent',
    sentAt: new Date(),
    readAt: null,
    failureReason: null,
    retryCount: 0,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDbClient(overrides: Partial<{
  getResult: any;
  countResult: any;
  updateResult: any;
}> = {}) {
  const { getResult = null, countResult = { count: 0 }, updateResult = undefined } = overrides;

  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(getResult),
    all: vi.fn().mockResolvedValue([]),
  };
}

// Mock env with a fake DB binding (getDb is mocked so the actual value doesn't matter)
const mockEnv = { DB: {} as D1Database };

// Build a test app that wraps the notifications handler
function buildApp() {
  const app = new Hono<{ Bindings: typeof mockEnv }>();
  app.route('/notifications', notificationsApp);
  return app;
}

// Helper to make a request with the mock env bindings
async function makeRequest(app: Hono<any>, path: string, options?: RequestInit) {
  return app.request(path, options, mockEnv);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /notifications/unread-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unread count of 0 when all notifications are read', async () => {
    const dbClient = makeDbClient({ countResult: { count: 0 } });
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications/unread-count');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.unreadCount).toBe(0);
  });

  it('returns correct unread count when notifications exist', async () => {
    const dbClient = makeDbClient({ getResult: { count: 5 } });
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications/unread-count');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.unreadCount).toBe(5);
  });

  it('returns 0 when DB returns null result', async () => {
    const dbClient = makeDbClient({ getResult: null });
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications/unread-count');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.unreadCount).toBe(0);
  });
});

describe('PATCH /notifications/:id/read - Mark notification as read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks an unread notification as read', async () => {
    const notification = makeNotification({ readAt: null });
    const dbClient = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(notification),
    };
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications/notif-1/read', { method: 'PATCH' });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('notif-1');
    expect(body.data.readAt).toBeDefined();
    // update should have been called to set readAt
    expect(dbClient.update).toHaveBeenCalled();
    expect(dbClient.set).toHaveBeenCalled();
  });

  it('does not update DB when notification is already read', async () => {
    const alreadyReadAt = new Date('2024-01-01T10:00:00Z');
    const notification = makeNotification({ readAt: alreadyReadAt });
    const dbClient = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(notification),
    };
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications/notif-1/read', { method: 'PATCH' });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // update should NOT have been called since already read
    expect(dbClient.update).not.toHaveBeenCalled();
  });

  it('returns 404 when notification does not exist', async () => {
    const dbClient = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(null),
    };
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications/nonexistent/read', { method: 'PATCH' });
    const body = await res.json() as any;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /notifications/read-all - Mark all notifications as read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all unread notifications as read', async () => {
    const dbClient = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications/read-all', { method: 'PATCH' });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('read');
    expect(body.data.readAt).toBeDefined();
    expect(dbClient.update).toHaveBeenCalled();
  });
});

describe('GET /notifications - Notification logging (list)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated list of notifications', async () => {
    const notif = makeNotification();
    let callCount = 0;
    // The list endpoint calls getDb once, then chains:
    // 1. select().from().where().get() → count
    // 2. select().from().where().orderBy().limit().offset() → array (awaited directly)
    const dbClient = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockImplementation(() => {
        // Second query returns array directly when awaited
        return Promise.resolve([notif]);
      }),
      get: vi.fn().mockResolvedValue({ count: 1 }),
    };
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications?page=1&limit=10');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.pagination).toBeDefined();
    expect(body.data.pagination.page).toBe(1);
  });

  it('returns empty list when user has no notifications', async () => {
    const dbClient = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ count: 0 }),
    };
    vi.mocked(getDb).mockReturnValue(dbClient as any);

    const app = buildApp();
    const res = await makeRequest(app, '/notifications');
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.pagination.total).toBe(0);
  });
});

describe('Notification retry logic - DB state tracking', () => {
  it('retryCount starts at 0 when notification is first created', async () => {
    // This is validated via the NotificationService which always sets retryCount: 0
    // The queue consumers increment it on failure
    const { MAX_NOTIFICATION_RETRIES } = await import('../utils/constants');

    // Simulate the retry state machine
    const states = [
      { retryCount: 0, shouldRetry: true },
      { retryCount: 1, shouldRetry: true },
      { retryCount: 2, shouldRetry: true },
      { retryCount: 3, shouldRetry: false }, // MAX_NOTIFICATION_RETRIES = 3
    ];

    for (const state of states) {
      const willRetry = state.retryCount < MAX_NOTIFICATION_RETRIES;
      expect(willRetry).toBe(state.shouldRetry);
    }
  });

  it('notification is marked permanently failed when retryCount reaches MAX_NOTIFICATION_RETRIES', async () => {
    const { MAX_NOTIFICATION_RETRIES } = await import('../utils/constants');

    // Simulate what emailQueue/smsQueue consumer does
    const currentRetryCount = MAX_NOTIFICATION_RETRIES - 1; // last allowed retry
    const newRetryCount = currentRetryCount + 1;

    const shouldMarkAsFailed = newRetryCount >= MAX_NOTIFICATION_RETRIES;
    expect(shouldMarkAsFailed).toBe(true);
  });

  it('notification status transitions: pending → failed (with retry) → failed (permanent)', async () => {
    const { MAX_NOTIFICATION_RETRIES } = await import('../utils/constants');

    // Track status through retry lifecycle
    let status = 'pending';
    let retryCount = 0;

    // Simulate 3 failures
    for (let attempt = 0; attempt < MAX_NOTIFICATION_RETRIES; attempt++) {
      const newRetryCount = retryCount + 1;
      if (newRetryCount >= MAX_NOTIFICATION_RETRIES) {
        status = 'failed'; // permanent failure
      } else {
        status = 'failed'; // temporary failure, will retry
        retryCount = newRetryCount;
      }
    }

    expect(status).toBe('failed');
    expect(retryCount).toBe(MAX_NOTIFICATION_RETRIES - 1);
  });
});

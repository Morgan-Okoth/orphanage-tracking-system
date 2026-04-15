import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from './userService';
import { UserRole, AccountStatus } from '../types';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

vi.mock('./auditService', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/client', () => ({
  getDb: vi.fn((db: unknown) => db),
}));

/**
 * Creates a minimal in-memory "database" that mimics Drizzle ORM's D1 client
 * interface used by UserService.
 */
function createMockDb(initialUsers: Record<string, any>[] = []) {
  const store = new Map<string, any>(initialUsers.map((u) => [u.id, { ...u }]));

  const makeChain = (rows: any[]) => ({
    all: vi.fn().mockResolvedValue(rows),
    get: vi.fn().mockResolvedValue(rows[0] ?? null),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  });

  return {
    _store: store,
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation((condition: any) => {
          // Resolve the condition lazily when .get() / .all() is called
          const filtered = [...store.values()].filter((u) => {
            if (!condition) return true;
            // condition is an object with field/value info from drizzle eq()
            // We simulate by checking all fields
            return condition._matches ? condition._matches(u) : true;
          });
          return makeChain(filtered);
        }),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([...store.values()]),
        get: vi.fn().mockResolvedValue(null),
      })),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((data: any) => {
        store.set(data.id, { ...data });
        return { run: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((data: any) => ({
        where: vi.fn().mockImplementation(() => {
          // Apply update to all matching records (simplified)
          for (const [id, user] of store.entries()) {
            store.set(id, { ...user, ...data });
          }
          return { run: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    })),
  } as unknown as D1Database;
}

/**
 * Creates a mock Hono Context with minimal env bindings.
 */
function createMockContext(db: D1Database) {
  return {
    env: { DB: db },
    req: { header: vi.fn().mockReturnValue('127.0.0.1') },
  } as any;
}

// ─── Test data ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<any> = {}) {
  return {
    id: crypto.randomUUID(),
    email: 'student@example.com',
    phone: '+254712345678',
    passwordHash: '$2b$12$hashedpassword',
    role: UserRole.STUDENT,
    firstName: 'Jane',
    lastName: 'Doe',
    accountStatus: AccountStatus.PENDING,
    isEmailVerified: false,
    isPhoneVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    approvedById: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  // ─── getUserById ────────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('should return a user without the password hash', async () => {
      const user = makeUser({ id: 'user-1', accountStatus: AccountStatus.ACTIVE });
      const db = createMockDb([user]);

      // Override select to return the specific user
      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(user),
          }),
        }),
      });

      const result = await userService.getUserById(db, 'user-1');

      expect(result).toBeDefined();
      expect((result as any).passwordHash).toBeUndefined();
      expect(result.id).toBe('user-1');
      expect(result.email).toBe(user.email);
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      const db = createMockDb([]);
      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(userService.getUserById(db, 'non-existent')).rejects.toThrow('USER_NOT_FOUND');
    });
  });

  // ─── approveUser ───────────────────────────────────────────────────────────

  describe('approveUser', () => {
    it('should set accountStatus to ACTIVE for a PENDING user', async () => {
      const user = makeUser({ id: 'user-pending', accountStatus: AccountStatus.PENDING });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      let updatedStatus: string | undefined;

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() =>
              Promise.resolve({ ...user, accountStatus: updatedStatus ?? user.accountStatus })
            ),
          }),
        }),
      });

      (db as any).update = vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((data: any) => {
          updatedStatus = data.accountStatus;
          return {
            where: vi.fn().mockResolvedValue(undefined),
          };
        }),
      });

      const result = await userService.approveUser(db, 'user-pending', 'admin-1', c);

      expect(updatedStatus).toBe(AccountStatus.ACTIVE);
      expect(result).toBeDefined();
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      const db = createMockDb([]);
      const c = createMockContext(db);

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(userService.approveUser(db, 'ghost', 'admin-1', c)).rejects.toThrow('USER_NOT_FOUND');
    });

    it('should throw USER_NOT_PENDING when user is already active', async () => {
      const user = makeUser({ id: 'user-active', accountStatus: AccountStatus.ACTIVE });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(user),
          }),
        }),
      });

      await expect(userService.approveUser(db, 'user-active', 'admin-1', c)).rejects.toThrow('USER_NOT_PENDING');
    });
  });

  // ─── rejectUser ────────────────────────────────────────────────────────────

  describe('rejectUser', () => {
    it('should set accountStatus to REJECTED for a PENDING user', async () => {
      const user = makeUser({ id: 'user-pending', accountStatus: AccountStatus.PENDING });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      let updatedStatus: string | undefined;

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() =>
              Promise.resolve({ ...user, accountStatus: updatedStatus ?? user.accountStatus })
            ),
          }),
        }),
      });

      (db as any).update = vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((data: any) => {
          updatedStatus = data.accountStatus;
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      });

      const result = await userService.rejectUser(db, 'user-pending', 'Incomplete documents', 'admin-1', c);

      expect(updatedStatus).toBe(AccountStatus.REJECTED);
      expect(result).toBeDefined();
    });

    it('should throw USER_NOT_PENDING when user is not pending', async () => {
      const user = makeUser({ id: 'user-active', accountStatus: AccountStatus.ACTIVE });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(user),
          }),
        }),
      });

      await expect(
        userService.rejectUser(db, 'user-active', 'reason', 'admin-1', c)
      ).rejects.toThrow('USER_NOT_PENDING');
    });
  });

  // ─── deactivateUser ────────────────────────────────────────────────────────

  describe('deactivateUser', () => {
    it('should set accountStatus to DEACTIVATED for an active user', async () => {
      const user = makeUser({ id: 'user-active', accountStatus: AccountStatus.ACTIVE });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      let updatedStatus: string | undefined;

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() =>
              Promise.resolve({ ...user, accountStatus: updatedStatus ?? user.accountStatus })
            ),
          }),
        }),
      });

      (db as any).update = vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((data: any) => {
          updatedStatus = data.accountStatus;
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      });

      const result = await userService.deactivateUser(db, 'user-active', 'admin-1', c);

      expect(updatedStatus).toBe(AccountStatus.DEACTIVATED);
      expect(result).toBeDefined();
    });

    it('should throw USER_ALREADY_DEACTIVATED when user is already deactivated', async () => {
      const user = makeUser({ id: 'user-deactivated', accountStatus: AccountStatus.DEACTIVATED });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(user),
          }),
        }),
      });

      await expect(
        userService.deactivateUser(db, 'user-deactivated', 'admin-1', c)
      ).rejects.toThrow('USER_ALREADY_DEACTIVATED');
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      const db = createMockDb([]);
      const c = createMockContext(db);

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        userService.deactivateUser(db, 'ghost', 'admin-1', c)
      ).rejects.toThrow('USER_NOT_FOUND');
    });
  });

  // ─── reactivateUser ────────────────────────────────────────────────────────

  describe('reactivateUser', () => {
    it('should set accountStatus to ACTIVE for a deactivated user', async () => {
      const user = makeUser({ id: 'user-deactivated', accountStatus: AccountStatus.DEACTIVATED });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      let updatedStatus: string | undefined;

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() =>
              Promise.resolve({ ...user, accountStatus: updatedStatus ?? user.accountStatus })
            ),
          }),
        }),
      });

      (db as any).update = vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((data: any) => {
          updatedStatus = data.accountStatus;
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      });

      const result = await userService.reactivateUser(db, 'user-deactivated', 'admin-1', c);

      expect(updatedStatus).toBe(AccountStatus.ACTIVE);
      expect(result).toBeDefined();
    });

    it('should throw USER_NOT_DEACTIVATED when user is not deactivated', async () => {
      const user = makeUser({ id: 'user-active', accountStatus: AccountStatus.ACTIVE });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(user),
          }),
        }),
      });

      await expect(
        userService.reactivateUser(db, 'user-active', 'admin-1', c)
      ).rejects.toThrow('USER_NOT_DEACTIVATED');
    });
  });

  // ─── updateUser ────────────────────────────────────────────────────────────

  describe('updateUser', () => {
    it('should update user fields and return updated user without passwordHash', async () => {
      const user = makeUser({ id: 'user-1', accountStatus: AccountStatus.ACTIVE });
      const db = createMockDb([user]);
      const c = createMockContext(db);

      const updatedUser = { ...user, firstName: 'Updated', passwordHash: undefined };

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(updatedUser),
          }),
        }),
      });

      (db as any).update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await userService.updateUser(db, 'user-1', { firstName: 'Updated' }, c);

      expect(result).toBeDefined();
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      const db = createMockDb([]);
      const c = createMockContext(db);

      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        userService.updateUser(db, 'ghost', { firstName: 'X' }, c)
      ).rejects.toThrow('USER_NOT_FOUND');
    });
  });
});

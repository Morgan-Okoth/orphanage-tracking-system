import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context } from 'hono';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  requireRole,
  requirePermission,
  getCurrentUser,
  isAdmin,
  isStudent,
  isResourceOwner,
  permissions,
} from './auth';
import { UserRole, JWTPayload } from '../../types';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const makeUser = (role: UserRole, userId = 'user-123'): JWTPayload => ({
  userId,
  email: 'test@example.com',
  role,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const mockContext = (user?: JWTPayload): Context => {
  const store = new Map<string, unknown>();
  if (user) store.set('user', user);

  return {
    get: (key: string) => store.get(key),
    set: vi.fn((key: string, value: unknown) => store.set(key, value)),
    json: vi.fn().mockReturnValue(new Response()),
    req: { header: vi.fn() },
    env: { JWT_SECRET: 'test-secret', SESSIONS: {} },
    header: vi.fn(),
  } as unknown as Context;
};

const mockNext = vi.fn().mockResolvedValue(undefined);

// ─── hasPermission ────────────────────────────────────────────────────────────

describe('hasPermission', () => {
  it('returns true for a permission the role has', () => {
    expect(hasPermission(UserRole.STUDENT, 'request:create')).toBe(true);
    expect(hasPermission(UserRole.ADMIN_LEVEL_1, 'request:approve')).toBe(true);
    expect(hasPermission(UserRole.ADMIN_LEVEL_2, 'audit:read')).toBe(true);
  });

  it('returns false for a permission the role does not have', () => {
    expect(hasPermission(UserRole.STUDENT, 'request:approve')).toBe(false);
    expect(hasPermission(UserRole.STUDENT, 'user:create')).toBe(false);
    expect(hasPermission(UserRole.ADMIN_LEVEL_1, 'audit:read')).toBe(false);
  });

  it('returns false for an unknown permission', () => {
    expect(hasPermission(UserRole.STUDENT, 'nonexistent:permission')).toBe(false);
  });

  it('returns false for an unknown role', () => {
    expect(hasPermission('UNKNOWN_ROLE' as UserRole, 'request:create')).toBe(false);
  });
});

// ─── hasAnyPermission ─────────────────────────────────────────────────────────

describe('hasAnyPermission', () => {
  it('returns true when the role has at least one of the permissions', () => {
    expect(
      hasAnyPermission(UserRole.STUDENT, ['request:create', 'request:approve'])
    ).toBe(true);
  });

  it('returns false when the role has none of the permissions', () => {
    expect(
      hasAnyPermission(UserRole.STUDENT, ['request:approve', 'user:create'])
    ).toBe(false);
  });
});

// ─── hasAllPermissions ────────────────────────────────────────────────────────

describe('hasAllPermissions', () => {
  it('returns true when the role has all permissions', () => {
    expect(
      hasAllPermissions(UserRole.STUDENT, ['request:create', 'request:read:own'])
    ).toBe(true);
  });

  it('returns false when the role is missing one permission', () => {
    expect(
      hasAllPermissions(UserRole.STUDENT, ['request:create', 'request:approve'])
    ).toBe(false);
  });
});

// ─── permissions matrix completeness ─────────────────────────────────────────

describe('permissions matrix', () => {
  it('STUDENT cannot access admin-only permissions', () => {
    const adminOnlyPermissions = [
      'request:approve',
      'request:reject',
      'user:create',
      'user:approve',
      'user:deactivate',
      'payment:initiate',
    ];
    for (const perm of adminOnlyPermissions) {
      expect(hasPermission(UserRole.STUDENT, perm)).toBe(false);
    }
  });

  it('STUDENT cannot access audit permissions', () => {
    expect(hasPermission(UserRole.STUDENT, 'audit:read')).toBe(false);
    expect(hasPermission(UserRole.STUDENT, 'report:generate')).toBe(false);
  });

  it('ADMIN_LEVEL_1 can approve and initiate payments', () => {
    expect(hasPermission(UserRole.ADMIN_LEVEL_1, 'request:approve')).toBe(true);
    expect(hasPermission(UserRole.ADMIN_LEVEL_1, 'payment:initiate')).toBe(true);
  });

  it('ADMIN_LEVEL_2 can audit but cannot initiate payments', () => {
    expect(hasPermission(UserRole.ADMIN_LEVEL_2, 'audit:read')).toBe(true);
    expect(hasPermission(UserRole.ADMIN_LEVEL_2, 'payment:initiate')).toBe(false);
  });

  it('all roles have notification:read:own', () => {
    for (const role of Object.values(UserRole)) {
      expect(hasPermission(role, 'notification:read:own')).toBe(true);
    }
  });

  it('permissions object covers all defined roles', () => {
    for (const role of Object.values(UserRole)) {
      expect(permissions[role]).toBeDefined();
      expect(Array.isArray(permissions[role])).toBe(true);
    }
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no user is in context', async () => {
    const c = mockContext();
    const middleware = requireRole(UserRole.ADMIN_LEVEL_1);
    await middleware(c, mockNext);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
      401
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 403 when user has wrong role', async () => {
    const c = mockContext(makeUser(UserRole.STUDENT));
    const middleware = requireRole(UserRole.ADMIN_LEVEL_1);
    await middleware(c, mockNext);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
      403
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('calls next() when user has the correct role', async () => {
    const c = mockContext(makeUser(UserRole.ADMIN_LEVEL_1));
    const middleware = requireRole(UserRole.ADMIN_LEVEL_1);
    await middleware(c, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
    expect(c.json).not.toHaveBeenCalled();
  });

  it('calls next() when user has one of multiple allowed roles', async () => {
    const c = mockContext(makeUser(UserRole.ADMIN_LEVEL_2));
    const middleware = requireRole(UserRole.ADMIN_LEVEL_1, UserRole.ADMIN_LEVEL_2);
    await middleware(c, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
  });

  it('blocks STUDENT from admin-only route', async () => {
    const c = mockContext(makeUser(UserRole.STUDENT));
    const middleware = requireRole(UserRole.ADMIN_LEVEL_1, UserRole.ADMIN_LEVEL_2);
    await middleware(c, mockNext);

    expect(c.json).toHaveBeenCalledWith(expect.anything(), 403);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

// ─── requirePermission ────────────────────────────────────────────────────────

describe('requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no user is in context', async () => {
    const c = mockContext();
    const middleware = requirePermission('request:approve');
    await middleware(c, mockNext);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
      401
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks the required permission', async () => {
    const c = mockContext(makeUser(UserRole.STUDENT));
    const middleware = requirePermission('request:approve');
    await middleware(c, mockNext);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
      403
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('calls next() when user has the required permission', async () => {
    const c = mockContext(makeUser(UserRole.STUDENT));
    const middleware = requirePermission('request:create');
    await middleware(c, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
    expect(c.json).not.toHaveBeenCalled();
  });

  it('calls next() when user has any one of multiple required permissions', async () => {
    const c = mockContext(makeUser(UserRole.ADMIN_LEVEL_1));
    const middleware = requirePermission('request:approve', 'request:verify');
    await middleware(c, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
  });

  it('includes required permissions and user role in 403 details', async () => {
    const c = mockContext(makeUser(UserRole.STUDENT));
    const middleware = requirePermission('audit:read');
    await middleware(c, mockNext);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          details: expect.objectContaining({
            required: ['audit:read'],
            userRole: UserRole.STUDENT,
          }),
        }),
      }),
      403
    );
  });
});

// ─── getCurrentUser ───────────────────────────────────────────────────────────

describe('getCurrentUser', () => {
  it('returns the user when present in context', () => {
    const user = makeUser(UserRole.STUDENT);
    const c = mockContext(user);
    expect(getCurrentUser(c)).toEqual(user);
  });

  it('throws when no user is in context', () => {
    const c = mockContext();
    expect(() => getCurrentUser(c)).toThrow('User not authenticated');
  });
});

// ─── isAdmin / isStudent helpers ──────────────────────────────────────────────

describe('isAdmin', () => {
  it('returns true for ADMIN_LEVEL_1', () => {
    expect(isAdmin(mockContext(makeUser(UserRole.ADMIN_LEVEL_1)))).toBe(true);
  });

  it('returns true for ADMIN_LEVEL_2', () => {
    expect(isAdmin(mockContext(makeUser(UserRole.ADMIN_LEVEL_2)))).toBe(true);
  });

  it('returns false for STUDENT', () => {
    expect(isAdmin(mockContext(makeUser(UserRole.STUDENT)))).toBe(false);
  });

  it('returns false when no user in context', () => {
    expect(isAdmin(mockContext())).toBe(false);
  });
});

describe('isStudent', () => {
  it('returns true for STUDENT', () => {
    expect(isStudent(mockContext(makeUser(UserRole.STUDENT)))).toBe(true);
  });

  it('returns false for ADMIN_LEVEL_1', () => {
    expect(isStudent(mockContext(makeUser(UserRole.ADMIN_LEVEL_1)))).toBe(false);
  });

  it('returns false when no user in context', () => {
    expect(isStudent(mockContext())).toBe(false);
  });
});

// ─── isResourceOwner ─────────────────────────────────────────────────────────

describe('isResourceOwner', () => {
  it('returns true when user owns the resource', () => {
    const c = mockContext(makeUser(UserRole.STUDENT, 'user-abc'));
    expect(isResourceOwner(c, 'user-abc')).toBe(true);
  });

  it('returns false when user does not own the resource', () => {
    const c = mockContext(makeUser(UserRole.STUDENT, 'user-abc'));
    expect(isResourceOwner(c, 'user-xyz')).toBe(false);
  });

  it('returns false when no user in context', () => {
    expect(isResourceOwner(mockContext(), 'user-abc')).toBe(false);
  });
});

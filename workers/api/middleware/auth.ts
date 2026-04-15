import { Context, Next } from 'hono';
import { AuthService } from '../../services/authService';
import { UserRole, JWTPayload } from '../../types';

// Permission matrix for role-based access control
export const permissions = {
  [UserRole.STUDENT]: [
    'request:create',
    'request:read:own',
    'request:update:own:draft',
    'document:upload:own',
    'document:read:own',
    'notification:read:own',
    'comment:read:own',
  ],
  [UserRole.ADMIN_LEVEL_1]: [
    'request:read:all',
    'request:review',
    'request:approve',
    'request:reject',
    'request:request-docs',
    'document:read:all',
    'user:create',
    'user:approve',
    'user:deactivate',
    'user:read:all',
    'payment:initiate',
    'comment:create',
    'comment:read:all',
    'notification:read:own',
  ],
  [UserRole.ADMIN_LEVEL_2]: [
    'request:read:all',
    'request:verify',
    'request:flag',
    'request:reject',
    'document:read:all',
    'audit:read',
    'report:generate',
    'user:read:all',
    'comment:create:internal',
    'comment:read:all',
    'notification:read:own',
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: string): boolean {
  const rolePermissions = permissions[role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole, requiredPermissions: string[]): boolean {
  return requiredPermissions.some((permission) => hasPermission(role, permission));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: UserRole, requiredPermissions: string[]): boolean {
  return requiredPermissions.every((permission) => hasPermission(role, permission));
}

/**
 * Authentication middleware - verifies JWT token and attaches user to context
 */
export function authMiddleware() {
  return async (c: Context, next: Next) => {
    try {
      // Get authorization header
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json(
          {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Missing or invalid authorization header',
            },
          },
          401
        );
      }

      // Extract token
      const token = authHeader.substring(7);

      // Get JWT secret from environment
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET not configured');
      }

      // Create auth service instance
      const authService = new AuthService(jwtSecret, c.env.SESSIONS);

      // Verify token
      const payload = authService.verifyAccessToken(token);

      // Attach user to context
      c.set('user', payload);
      c.set('userId', payload.userId);
      c.set('userRole', payload.role);

      await next();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'TOKEN_EXPIRED') {
          return c.json(
            {
              success: false,
              error: {
                code: 'TOKEN_EXPIRED',
                message: 'Access token has expired',
              },
            },
            401
          );
        }
        if (error.message === 'INVALID_TOKEN') {
          return c.json(
            {
              success: false,
              error: {
                code: 'INVALID_TOKEN',
                message: 'Invalid access token',
              },
            },
            401
          );
        }
      }

      return c.json(
        {
          success: false,
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: 'Authentication failed',
          },
        },
        401
      );
    }
  };
}

/**
 * Authorization middleware - checks if user has required role(s)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as JWTPayload | undefined;

    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        401
      );
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
          },
        },
        403
      );
    }

    await next();
  };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as JWTPayload | undefined;

    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        401
      );
    }

    const hasRequiredPermission = hasAnyPermission(user.role, requiredPermissions);

    if (!hasRequiredPermission) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            details: {
              required: requiredPermissions,
              userRole: user.role,
            },
          },
        },
        403
      );
    }

    await next();
  };
}

/**
 * Optional authentication middleware - attaches user if token is present but doesn't require it
 */
export function optionalAuth() {
  return async (c: Context, next: Next) => {
    try {
      const authHeader = c.req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const jwtSecret = c.env.JWT_SECRET;

        if (jwtSecret) {
          const authService = new AuthService(jwtSecret, c.env.SESSIONS);
          const payload = authService.verifyAccessToken(token);
          c.set('user', payload);
          c.set('userId', payload.userId);
          c.set('userRole', payload.role);
        }
      }
    } catch (error) {
      // Silently fail for optional auth
    }

    await next();
  };
}

/**
 * Helper to get current user from context
 */
export function getCurrentUser(c: Context): JWTPayload {
  const user = c.get('user') as JWTPayload | undefined;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user;
}

/**
 * Helper to check if current user owns a resource
 */
export function isResourceOwner(c: Context, resourceOwnerId: string): boolean {
  const user = c.get('user') as JWTPayload | undefined;
  if (!user) {
    return false;
  }
  return user.userId === resourceOwnerId;
}

/**
 * Helper to check if current user is admin
 */
export function isAdmin(c: Context): boolean {
  const user = c.get('user') as JWTPayload | undefined;
  if (!user) {
    return false;
  }
  return user.role === UserRole.ADMIN_LEVEL_1 || user.role === UserRole.ADMIN_LEVEL_2;
}

/**
 * Helper to check if current user is student
 */
export function isStudent(c: Context): boolean {
  const user = c.get('user') as JWTPayload | undefined;
  if (!user) {
    return false;
  }
  return user.role === UserRole.STUDENT;
}

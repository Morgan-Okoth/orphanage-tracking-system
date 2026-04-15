import { Context } from 'hono';
import { z } from 'zod';
import { AuthService } from '../services/authService';
import { NotificationService } from '../services/notificationService';
import { AccountStatus, AuditAction, ApiResponse } from '../types';
import { auditLog } from '../services/auditService';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { getDb } from '../db/client';
import { getCurrentUser } from '../api/middleware/auth';
import { registerSchema, loginSchema, refreshTokenSchema } from '../utils/schemas';
import { sanitizeText } from '../utils/validation';

/**
 * POST /api/v1/auth/register
 * Register a new user with pending status
 */
export async function register(c: Context): Promise<Response> {
  try {
    // Parse and validate request body
    const body = await c.req.json();
    const validatedData = registerSchema.parse(body);

    // Get auth service
    const authService = new AuthService(c.env.JWT_SECRET, c.env.SESSIONS);
    const notificationService = new NotificationService();

    // Sanitize text inputs before storing
    const sanitizedData = {
      ...validatedData,
      firstName: sanitizeText(validatedData.firstName, 100),
      lastName: sanitizeText(validatedData.lastName, 100),
    };

    // Register user
    const result = await authService.register(sanitizedData, c.env.DB);

    // Log audit event
    await auditLog(
      result.userId,
      AuditAction.USER_CREATED,
      'User',
      result.userId,
      {
        email: sanitizedData.email,
        role: sanitizedData.role,
        accountStatus: result.accountStatus,
      },
      c
    );

    // Send registration notification
    await notificationService.sendRegistrationNotification(
      c.env.DB,
      result.userId,
      `${sanitizedData.firstName} ${sanitizedData.lastName}`,
      c.env.EMAIL_QUEUE
    );

    // Return success response
    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Registration successful. Awaiting admin approval.',
        data: {
          userId: result.userId,
          email: sanitizedData.email,
          accountStatus: result.accountStatus,
        },
      },
      201
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error) {
      if (error.message === 'USER_ALREADY_EXISTS') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'USER_ALREADY_EXISTS',
              message: 'A user with this email already exists',
            },
          },
          409
        );
      }

      if (error.message === 'PHONE_ALREADY_EXISTS') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'PHONE_ALREADY_EXISTS',
              message: 'A user with this phone number already exists',
            },
          },
          409
        );
      }
    }

    console.error('Registration error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: 'Registration failed. Please try again.',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/auth/login
 * Login with JWT token generation
 */
export async function login(c: Context): Promise<Response> {
  try {
    // Parse and validate request body
    const body = await c.req.json();
    const validatedData = loginSchema.parse(body);

    // Get auth service
    const authService = new AuthService(c.env.JWT_SECRET, c.env.SESSIONS);

    // Attempt login
    const result = await authService.login(validatedData, c.env.DB);

    // Log successful login
    await auditLog(
      result.user.id,
      AuditAction.USER_LOGIN,
      'User',
      result.user.id,
      {
        email: result.user.email,
        role: result.user.role,
      },
      c
    );

    // Return success response with tokens
    return c.json<ApiResponse>(
      {
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            role: result.user.role,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            accountStatus: result.user.accountStatus,
          },
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn,
        },
      },
      200
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error) {
      // Log failed login attempt
      if (error.message === 'INVALID_CREDENTIALS') {
        const body = await c.req.json();
        await auditLog(
          null,
          AuditAction.USER_LOGIN_FAILED,
          'User',
          null,
          {
            email: body.email,
            reason: 'Invalid credentials',
          },
          c
        );

        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password',
            },
          },
          401
        );
      }

      if (error.message.startsWith('ACCOUNT_')) {
        const status = error.message.replace('ACCOUNT_', '');
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: error.message,
              message: `Account is ${status.toLowerCase()}. Please contact an administrator.`,
            },
          },
          403
        );
      }
    }

    console.error('Login error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: 'Login failed. Please try again.',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/auth/logout
 * Logout with token revocation
 */
export async function logout(c: Context): Promise<Response> {
  try {
    // Parse request body
    const body = await c.req.json();
    const validatedData = refreshTokenSchema.parse(body);

    // Get auth service
    const authService = new AuthService(c.env.JWT_SECRET, c.env.SESSIONS);

    // Get current user
    const user = getCurrentUser(c);

    // Revoke refresh token
    await authService.logout(validatedData.refreshToken);

    // Log logout
    await auditLog(
      user.userId,
      AuditAction.USER_LOGOUT,
      'User',
      user.userId,
      {},
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'Logout successful',
      },
      200
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    console.error('Logout error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'LOGOUT_FAILED',
          message: 'Logout failed. Please try again.',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/auth/refresh-token
 * Refresh access token using refresh token
 */
export async function refreshToken(c: Context): Promise<Response> {
  try {
    // Parse request body
    const body = await c.req.json();
    const validatedData = refreshTokenSchema.parse(body);

    // Get auth service
    const authService = new AuthService(c.env.JWT_SECRET, c.env.SESSIONS);

    // Refresh tokens
    const tokens = await authService.refreshAccessToken(validatedData.refreshToken, c.env.DB);

    return c.json<ApiResponse>(
      {
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
      },
      200
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors,
          },
        },
        400
      );
    }

    if (error instanceof Error) {
      if (error.message === 'INVALID_REFRESH_TOKEN') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INVALID_REFRESH_TOKEN',
              message: 'Invalid or expired refresh token',
            },
          },
          401
        );
      }

      if (error.message === 'USER_NOT_FOUND') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User not found',
            },
          },
          404
        );
      }

      if (error.message.startsWith('ACCOUNT_')) {
        const status = error.message.replace('ACCOUNT_', '');
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: error.message,
              message: `Account is ${status.toLowerCase()}. Please contact an administrator.`,
            },
          },
          403
        );
      }
    }

    console.error('Token refresh error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'TOKEN_REFRESH_FAILED',
          message: 'Token refresh failed. Please login again.',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/auth/me
 * Get current user profile
 */
export async function getCurrentUserProfile(c: Context): Promise<Response> {
  try {
    // Get current user from context (set by auth middleware)
    const user = getCurrentUser(c);

    // Get full user data from database
    const db = getDb(c.env.DB);
    const userData = await db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        accountStatus: users.accountStatus,
        isEmailVerified: users.isEmailVerified,
        isPhoneVerified: users.isPhoneVerified,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, user.userId))
      .get();

    if (!userData) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        },
        404
      );
    }

    return c.json<ApiResponse>(
      {
        success: true,
        data: userData,
      },
      200
    );
  } catch (error) {
    console.error('Get current user error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'FETCH_USER_FAILED',
          message: 'Failed to fetch user profile',
        },
      },
      500
    );
  }
}

// Export all handlers
export const authHandlers = {
  register,
  login,
  logout,
  refreshToken,
  getCurrentUserProfile,
};

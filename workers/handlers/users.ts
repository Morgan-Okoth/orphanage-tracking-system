import { Context } from 'hono';
import { z } from 'zod';
import { UserService, CreateUserData } from '../services/userService';
import { NotificationService } from '../services/notificationService';
import { UserRole, AccountStatus, ApiResponse } from '../types';
import { getCurrentUser } from '../api/middleware/auth';
import { updateUserSchema, rejectUserSchema } from '../utils/schemas';
import { sanitizeText } from '../utils/validation';

// Schema for creating user
const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(10, 'Phone number is required'),
  role: z.nativeEnum(UserRole).optional(),
});

/**
 * GET /api/v1/users
 * List all users (admin only)
 */
export async function listUsers(c: Context): Promise<Response> {
  try {
    const userService = new UserService();

    // Get query parameters
    const role = c.req.query('role') as UserRole | undefined;
    const accountStatus = (c.req.query('accountStatus') || c.req.query('status')) as AccountStatus | undefined;
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');

    // Get users
    const result = await userService.getAllUsers(c.env.DB, {
      role,
      accountStatus,
      page,
      limit,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: result,
      },
      200
    );
  } catch (error) {
    console.error('List users error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'LIST_USERS_FAILED',
          message: 'Failed to list users',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/users/pending
 * List pending users awaiting approval (admin only)
 */
export async function listPendingUsers(c: Context): Promise<Response> {
  try {
    const userService = new UserService();

    const pendingUsers = await userService.getPendingUsers(c.env.DB);

    return c.json<ApiResponse>(
      {
        success: true,
        data: pendingUsers,
      },
      200
    );
  } catch (error) {
    console.error('List pending users error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'LIST_PENDING_USERS_FAILED',
          message: 'Failed to list pending users',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/users
 * Create a new user (admin only - creates user with ACTIVE status)
 */
export async function createUser(c: Context): Promise<Response> {
  try {
    const currentUser = getCurrentUser(c);
    const body = await c.req.json();
    const validatedData = createUserSchema.parse(body);

    const userService = new UserService();

    const newUser = await userService.createUser(
      c.env.DB,
      {
        email: validatedData.email,
        password: validatedData.password,
        firstName: sanitizeText(validatedData.firstName, 100),
        lastName: sanitizeText(validatedData.lastName, 100),
        phone: validatedData.phone,
        role: validatedData.role,
      },
      currentUser.userId,
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'User created successfully',
        data: newUser,
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
      if (error.message === 'EMAIL_ALREADY_EXISTS') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'EMAIL_ALREADY_EXISTS',
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

    console.error('Create user error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'CREATE_USER_FAILED',
          message: 'Failed to create user',
        },
      },
      500
    );
  }
}

/**
 * GET /api/v1/users/:id
 * Get user details
 */
export async function getUserById(c: Context): Promise<Response> {
  try {
    const userId = c.req.param('id');
    const currentUser = getCurrentUser(c);
    const userService = new UserService();

    // Students can only view their own profile
    if (currentUser.role === UserRole.STUDENT && currentUser.userId !== userId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only view your own profile',
          },
        },
        403
      );
    }

    const user = await userService.getUserById(c.env.DB, userId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: user,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
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

    console.error('Get user error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'GET_USER_FAILED',
          message: 'Failed to get user',
        },
      },
      500
    );
  }
}

/**
 * PATCH /api/v1/users/:id
 * Update user profile
 */
export async function updateUser(c: Context): Promise<Response> {
  try {
    const userId = c.req.param('id');
    const currentUser = getCurrentUser(c);
    const body = await c.req.json();
    const validatedData = updateUserSchema.parse(body);

    // Sanitize text inputs
    const sanitizedData = {
      ...validatedData,
      ...(validatedData.firstName !== undefined && { firstName: sanitizeText(validatedData.firstName, 100) }),
      ...(validatedData.lastName !== undefined && { lastName: sanitizeText(validatedData.lastName, 100) }),
    };

    const userService = new UserService();

    // Students can only update their own profile
    if (currentUser.role === UserRole.STUDENT && currentUser.userId !== userId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only update your own profile',
          },
        },
        403
      );
    }

    if (
      validatedData.role !== undefined &&
      currentUser.role !== UserRole.SUPERADMIN
    ) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only superadmin can change user roles',
          },
        },
        403
      );
    }

    const updatedUser = await userService.updateUser(
      c.env.DB,
      userId,
      sanitizedData,
      c
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'User updated successfully',
        data: updatedUser,
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

      if (error.message === 'EMAIL_ALREADY_EXISTS') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'EMAIL_ALREADY_EXISTS',
              message: 'Email already in use',
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
              message: 'Phone number already in use',
            },
          },
          409
        );
      }
    }

    console.error('Update user error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'UPDATE_USER_FAILED',
          message: 'Failed to update user',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/users/:id/approve
 * Approve pending user (admin only)
 */
export async function approveUser(c: Context): Promise<Response> {
  try {
    const userId = c.req.param('id');
    const currentUser = getCurrentUser(c);
    const userService = new UserService();
    const notificationService = new NotificationService();

    const updatedUser = await userService.approveUser(
      c.env.DB,
      userId,
      currentUser.userId,
      c
    );

    // Send approval notification
    await notificationService.sendApprovalNotification(
      c.env.DB,
      updatedUser.id,
      `${updatedUser.firstName} ${updatedUser.lastName}`,
      c.env.EMAIL_QUEUE,
      c.env.SMS_QUEUE
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'User approved successfully',
        data: updatedUser,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
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

      if (error.message === 'USER_NOT_PENDING') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'USER_NOT_PENDING',
              message: 'User is not in pending status',
            },
          },
          400
        );
      }
    }

    console.error('Approve user error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'APPROVE_USER_FAILED',
          message: 'Failed to approve user',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/users/:id/reject
 * Reject pending user (admin only)
 */
export async function rejectUser(c: Context): Promise<Response> {
  try {
    const userId = c.req.param('id');
    const currentUser = getCurrentUser(c);
    const body = await c.req.json();
    const validatedData = rejectUserSchema.parse(body);

    const userService = new UserService();
    const notificationService = new NotificationService();

    const updatedUser = await userService.rejectUser(
      c.env.DB,
      userId,
      sanitizeText(validatedData.reason, 500),
      currentUser.userId,
      c
    );

    // Send rejection notification
    await notificationService.sendRejectionNotification(
      c.env.DB,
      updatedUser.id,
      `${updatedUser.firstName} ${updatedUser.lastName}`,
      validatedData.reason,
      c.env.EMAIL_QUEUE
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'User rejected successfully',
        data: updatedUser,
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

      if (error.message === 'USER_NOT_PENDING') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'USER_NOT_PENDING',
              message: 'User is not in pending status',
            },
          },
          400
        );
      }
    }

    console.error('Reject user error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'REJECT_USER_FAILED',
          message: 'Failed to reject user',
        },
      },
      500
    );
  }
}

/**
 * DELETE /api/v1/users/:id
 * Deactivate user (soft delete, admin only)
 */
export async function deactivateUser(c: Context): Promise<Response> {
  try {
    const userId = c.req.param('id');
    const currentUser = getCurrentUser(c);
    const userService = new UserService();
    const notificationService = new NotificationService();

    const updatedUser = await userService.deactivateUser(
      c.env.DB,
      userId,
      currentUser.userId,
      c
    );

    // Send deactivation notification
    await notificationService.sendDeactivationNotification(
      c.env.DB,
      updatedUser.id,
      `${updatedUser.firstName} ${updatedUser.lastName}`,
      c.env.EMAIL_QUEUE
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'User deactivated successfully',
        data: updatedUser,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
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

      if (error.message === 'USER_ALREADY_DEACTIVATED') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'USER_ALREADY_DEACTIVATED',
              message: 'User is already deactivated',
            },
          },
          400
        );
      }
    }

    console.error('Deactivate user error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'DEACTIVATE_USER_FAILED',
          message: 'Failed to deactivate user',
        },
      },
      500
    );
  }
}

/**
 * POST /api/v1/users/:id/reactivate
 * Reactivate deactivated user (admin only)
 */
export async function reactivateUser(c: Context): Promise<Response> {
  try {
    const userId = c.req.param('id');
    const currentUser = getCurrentUser(c);
    const userService = new UserService();
    const notificationService = new NotificationService();

    const updatedUser = await userService.reactivateUser(
      c.env.DB,
      userId,
      currentUser.userId,
      c
    );

    // Send reactivation notification
    await notificationService.sendReactivationNotification(
      c.env.DB,
      updatedUser.id,
      `${updatedUser.firstName} ${updatedUser.lastName}`,
      c.env.EMAIL_QUEUE
    );

    return c.json<ApiResponse>(
      {
        success: true,
        message: 'User reactivated successfully',
        data: updatedUser,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
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

      if (error.message === 'USER_NOT_DEACTIVATED') {
        return c.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'USER_NOT_DEACTIVATED',
              message: 'User is not deactivated',
            },
          },
          400
        );
      }
    }

    console.error('Reactivate user error:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'REACTIVATE_USER_FAILED',
          message: 'Failed to reactivate user',
        },
      },
      500
    );
  }
}

// Export all handlers
export const userHandlers = {
  listUsers,
  listPendingUsers,
  createUser,
  getUserById,
  updateUser,
  approveUser,
  rejectUser,
  deactivateUser,
  reactivateUser,
};

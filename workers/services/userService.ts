import { eq, and, or, desc } from 'drizzle-orm';
import { users } from '../db/schema';
import { UserRole, AccountStatus, AuditAction } from '../types';
import { getDb } from '../db/client';
import { auditLog } from './auditService';
import { Context } from 'hono';

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  role?: UserRole;
}

export interface ApproveUserData {
  approvedById: string;
}

export interface RejectUserData {
  reason: string;
}

export class UserService {
  /**
   * Get all users with optional filtering
   */
  async getAllUsers(
    db: D1Database,
    filters?: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      page?: number;
      limit?: number;
    }
  ) {
    const dbClient = getDb(db);
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let query = dbClient.select().from(users);

    // Apply filters
    const conditions = [];
    if (filters?.role) {
      conditions.push(eq(users.role, filters.role));
    }
    if (filters?.accountStatus) {
      conditions.push(eq(users.accountStatus, filters.accountStatus));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Get total count
    const allUsers = await query.all();
    const total = allUsers.length;

    // Apply pagination
    const paginatedUsers = await query
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    // Remove password hashes from response
    const sanitizedUsers = paginatedUsers.map(({ passwordHash, ...user }) => user);

    return {
      items: sanitizedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(db: D1Database, userId: string) {
    const dbClient = getDb(db);

    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Remove password hash
    const { passwordHash, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  /**
   * Get pending users awaiting approval
   */
  async getPendingUsers(db: D1Database) {
    const dbClient = getDb(db);

    const pendingUsers = await dbClient
      .select()
      .from(users)
      .where(eq(users.accountStatus, AccountStatus.PENDING))
      .orderBy(desc(users.createdAt))
      .all();

    // Remove password hashes
    return pendingUsers.map(({ passwordHash, ...user }) => user);
  }

  /**
   * Update user profile
   */
  async updateUser(
    db: D1Database,
    userId: string,
    data: UpdateUserData,
    c: Context
  ) {
    const dbClient = getDb(db);

    // Check if user exists
    const existingUser = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!existingUser) {
      throw new Error('USER_NOT_FOUND');
    }

    // Check if email is being changed and if it's already taken
    if (data.email && data.email !== existingUser.email) {
      const emailExists = await dbClient
        .select()
        .from(users)
        .where(eq(users.email, data.email.toLowerCase()))
        .get();

      if (emailExists) {
        throw new Error('EMAIL_ALREADY_EXISTS');
      }
    }

    // Check if phone is being changed and if it's already taken
    if (data.phone && data.phone !== existingUser.phone) {
      const phoneExists = await dbClient
        .select()
        .from(users)
        .where(eq(users.phone, data.phone))
        .get();

      if (phoneExists) {
        throw new Error('PHONE_ALREADY_EXISTS');
      }
    }

    // Update user
    const updateData: any = {
      ...data,
      updatedAt: new Date(),
    };

    if (data.email) {
      updateData.email = data.email.toLowerCase();
      updateData.isEmailVerified = false; // Reset verification if email changes
    }

    if (data.phone) {
      updateData.isPhoneVerified = false; // Reset verification if phone changes
    }

    await dbClient
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    // Get updated user
    const updatedUser = await this.getUserById(db, userId);

    return updatedUser;
  }

  /**
   * Approve pending user account
   */
  async approveUser(
    db: D1Database,
    userId: string,
    approvedById: string,
    c: Context
  ) {
    const dbClient = getDb(db);

    // Check if user exists and is pending
    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    if (user.accountStatus !== AccountStatus.PENDING) {
      throw new Error('USER_NOT_PENDING');
    }

    // Update user status to ACTIVE
    await dbClient
      .update(users)
      .set({
        accountStatus: AccountStatus.ACTIVE,
        approvedById,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Log audit event
    await auditLog(
      approvedById,
      AuditAction.USER_APPROVED,
      'User',
      userId,
      {
        approvedUserId: userId,
        approvedUserEmail: user.email,
        approvedUserRole: user.role,
      },
      c
    );

    // Get updated user
    const updatedUser = await this.getUserById(db, userId);

    return updatedUser;
  }

  /**
   * Reject pending user account
   */
  async rejectUser(
    db: D1Database,
    userId: string,
    reason: string,
    rejectedById: string,
    c: Context
  ) {
    const dbClient = getDb(db);

    // Check if user exists and is pending
    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    if (user.accountStatus !== AccountStatus.PENDING) {
      throw new Error('USER_NOT_PENDING');
    }

    // Update user status to REJECTED
    await dbClient
      .update(users)
      .set({
        accountStatus: AccountStatus.REJECTED,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Log audit event
    await auditLog(
      rejectedById,
      AuditAction.USER_DEACTIVATED,
      'User',
      userId,
      {
        rejectedUserId: userId,
        rejectedUserEmail: user.email,
        rejectedUserRole: user.role,
        reason,
      },
      c
    );

    // Get updated user
    const updatedUser = await this.getUserById(db, userId);

    return updatedUser;
  }

  /**
   * Deactivate user account (soft delete)
   */
  async deactivateUser(
    db: D1Database,
    userId: string,
    deactivatedById: string,
    c: Context
  ) {
    const dbClient = getDb(db);

    // Check if user exists
    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    if (user.accountStatus === AccountStatus.DEACTIVATED) {
      throw new Error('USER_ALREADY_DEACTIVATED');
    }

    // Update user status to DEACTIVATED
    await dbClient
      .update(users)
      .set({
        accountStatus: AccountStatus.DEACTIVATED,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Log audit event
    await auditLog(
      deactivatedById,
      AuditAction.USER_DEACTIVATED,
      'User',
      userId,
      {
        deactivatedUserId: userId,
        deactivatedUserEmail: user.email,
        deactivatedUserRole: user.role,
      },
      c
    );

    // Get updated user
    const updatedUser = await this.getUserById(db, userId);

    return updatedUser;
  }

  /**
   * Reactivate deactivated user account
   */
  async reactivateUser(
    db: D1Database,
    userId: string,
    reactivatedById: string,
    c: Context
  ) {
    const dbClient = getDb(db);

    // Check if user exists and is deactivated
    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    if (user.accountStatus !== AccountStatus.DEACTIVATED) {
      throw new Error('USER_NOT_DEACTIVATED');
    }

    // Update user status to ACTIVE
    await dbClient
      .update(users)
      .set({
        accountStatus: AccountStatus.ACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Log audit event
    await auditLog(
      reactivatedById,
      AuditAction.USER_APPROVED,
      'User',
      userId,
      {
        reactivatedUserId: userId,
        reactivatedUserEmail: user.email,
        reactivatedUserRole: user.role,
      },
      c
    );

    // Get updated user
    const updatedUser = await this.getUserById(db, userId);

    return updatedUser;
  }
}

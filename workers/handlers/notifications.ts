/**
 * Notification Management Handlers
 * Handles notification-related API endpoints
 */

import { Hono } from 'hono';
import { getDb } from '../db/client';
import { notifications } from '../db/schema';
import { eq, desc, and, count, isNull } from 'drizzle-orm';
import { authMiddleware } from '../api/middleware/auth';
import type { Env } from '../api/index';
import type { ApiResponse, PaginatedResponse, JWTPayload } from '../types';

const app = new Hono<{ Bindings: Env; Variables: { user: JWTPayload } }>();

// Apply auth middleware to all routes
app.use('*', authMiddleware());

/**
 * Validate pagination parameters
 */
function validatePagination(query: Record<string, string | string[]>) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '50'), 10)));
  return { page, limit };
}

/**
 * GET /notifications
 * Get user's notifications with pagination
 */
app.get('/', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const db = getDb(c.env.DB);
    const { page, limit } = validatePagination(c.req.query());

    const totalResult = await db
      .select({ count: count() })
      .from(notifications)
      .where(eq(notifications.userId, user.userId))
      .get();

    const total = totalResult?.count || 0;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const userNotifications = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        channel: notifications.channel,
        subject: notifications.subject,
        message: notifications.message,
        status: notifications.status,
        sentAt: notifications.sentAt,
        readAt: notifications.readAt,
        failureReason: notifications.failureReason,
        retryCount: notifications.retryCount,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, user.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const response: PaginatedResponse<typeof userNotifications[0]> = {
      items: userNotifications,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };

    return c.json<ApiResponse<PaginatedResponse<typeof userNotifications[0]>>>({
      success: true,
      data: response,
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve notifications' },
    }, 500);
  }
});

/**
 * GET /notifications/unread-count
 * Get count of unread notifications (those without a readAt timestamp)
 */
app.get('/unread-count', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const db = getDb(c.env.DB);

    // Count notifications that have not been read yet (readAt is null)
    const result = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, user.userId),
          isNull(notifications.readAt)
        )
      )
      .get();

    const unreadCount = result?.count || 0;

    return c.json<ApiResponse<{ unreadCount: number }>>({
      success: true,
      data: { unreadCount },
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get unread count' },
    }, 500);
  }
});

/**
 * GET /notifications/stats
 * Get notification statistics for the user
 * NOTE: Must be registered before /:id to avoid route conflict
 */
app.get('/stats', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const db = getDb(c.env.DB);

    const stats = await db
      .select({
        status: notifications.status,
        type: notifications.type,
        count: count(),
      })
      .from(notifications)
      .where(eq(notifications.userId, user.userId))
      .groupBy(notifications.status, notifications.type);

    const organized = {
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      total: 0,
    };

    for (const stat of stats) {
      organized.byStatus[stat.status] = (organized.byStatus[stat.status] || 0) + stat.count;
      organized.byType[stat.type] = (organized.byType[stat.type] || 0) + stat.count;
      organized.total += stat.count;
    }

    return c.json<ApiResponse<typeof organized>>({
      success: true,
      data: organized,
    });

  } catch (error) {
    console.error('Get notification stats error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get notification statistics' },
    }, 500);
  }
});

/**
 * PATCH /notifications/read-all
 * Mark all of the user's notifications as read
 * NOTE: Must be registered before /:id/read to avoid route conflict
 */
app.patch('/read-all', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const db = getDb(c.env.DB);
    const now = new Date();

    await db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.userId, user.userId),
          isNull(notifications.readAt)
        )
      );

    return c.json<ApiResponse<{ readAt: Date }>>({
      success: true,
      message: 'All notifications marked as read',
      data: { readAt: now },
    });

  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to mark all notifications as read' },
    }, 500);
  }
});

/**
 * GET /notifications/:id
 * Get specific notification details
 */
app.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const notificationId = c.req.param('id');
    const db = getDb(c.env.DB);

    const notification = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, user.userId)
        )
      )
      .get();

    if (!notification) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      }, 404);
    }

    return c.json<ApiResponse<typeof notification>>({
      success: true,
      data: notification,
    });

  } catch (error) {
    console.error('Get notification error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve notification' },
    }, 500);
  }
});

/**
 * PATCH /notifications/:id/read
 * Mark a specific notification as read
 */
app.patch('/:id/read', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const notificationId = c.req.param('id');
    const db = getDb(c.env.DB);

    // Verify the notification belongs to the user
    const notification = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, user.userId)
        )
      )
      .get();

    if (!notification) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      }, 404);
    }

    const readAt = notification.readAt ?? new Date();

    // Only update if not already read
    if (!notification.readAt) {
      await db
        .update(notifications)
        .set({ readAt })
        .where(eq(notifications.id, notificationId));
    }

    return c.json<ApiResponse<{ id: string; readAt: Date }>>({
      success: true,
      message: 'Notification marked as read',
      data: { id: notificationId, readAt },
    });

  } catch (error) {
    console.error('Mark notification read error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to mark notification as read' },
    }, 500);
  }
});

export default app;

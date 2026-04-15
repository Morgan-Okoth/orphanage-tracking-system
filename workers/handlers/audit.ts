/**
 * Audit Log Handlers
 * Handles audit log query API endpoints
 * Restricted to ADMIN_LEVEL_2 only
 */

import { Hono } from 'hono';
import { getDb } from '../db/client';
import { auditLogs } from '../db/schema';
import { eq, and, gte, lte, desc, count } from 'drizzle-orm';
import { authMiddleware, requireRole } from '../api/middleware/auth';
import type { Env } from '../api/index';
import type { ApiResponse, PaginatedResponse, JWTPayload } from '../types';
import { UserRole } from '../types';

const app = new Hono<{ Bindings: Env; Variables: { user: JWTPayload } }>();

// Apply auth middleware and restrict to ADMIN_LEVEL_2 only
app.use('*', authMiddleware());
app.use('*', requireRole(UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN));

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

/**
 * GET /audit-logs
 * Query audit logs with optional filters and pagination
 * Supports: userId, action, startDate, endDate, page, limit
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

    const query = c.req.query();

    // Parse pagination
    const page = Math.max(1, parseInt(String(query.page || '1'), 10));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(query.limit || String(DEFAULT_LIMIT)), 10)));
    const offset = (page - 1) * limit;

    // Build filter conditions
    const conditions = [];

    if (query.userId) {
      conditions.push(eq(auditLogs.userId, query.userId));
    }

    if (query.action) {
      conditions.push(eq(auditLogs.action, query.action as typeof auditLogs.action['_']['data']));
    }

    if (query.startDate) {
      const startDate = new Date(query.startDate);
      if (!isNaN(startDate.getTime())) {
        conditions.push(gte(auditLogs.timestamp, startDate));
      }
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      if (!isNaN(endDate.getTime())) {
        conditions.push(lte(auditLogs.timestamp, endDate));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const db = getDb(c.env.DB);

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(whereClause)
      .get();

    const total = totalResult?.count || 0;
    const totalPages = Math.ceil(total / limit);

    // Fetch paginated results
    const logs = await db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        timestamp: auditLogs.timestamp,
      })
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);

    const response: PaginatedResponse<typeof logs[0]> = {
      items: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };

    return c.json<ApiResponse<PaginatedResponse<typeof logs[0]>>>({
      success: true,
      data: response,
    });

  } catch (error) {
    console.error('Get audit logs error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve audit logs' },
    }, 500);
  }
});

export default app;

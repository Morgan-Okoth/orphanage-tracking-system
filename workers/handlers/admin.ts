/**
 * Admin Dashboard Handlers
 * Handles admin dashboard API endpoints
 */

import { Hono } from 'hono';
import { getDb } from '../db/client';
import { requests, auditLogs, transactions } from '../db/schema';
import { eq, count, sum, and, gte, lt, desc, avg, sql } from 'drizzle-orm';
import { authMiddleware, requireRole } from '../api/middleware/auth';
import type { Env } from '../api/index';
import type { ApiResponse, JWTPayload } from '../types';
import { UserRole, RequestStatus } from '../types';

const app = new Hono<{ Bindings: Env; Variables: { user: JWTPayload } }>();

// Apply auth middleware and restrict to admin roles
app.use('*', authMiddleware());
app.use('*', requireRole(UserRole.ADMIN_LEVEL_1, UserRole.ADMIN_LEVEL_2));

const CACHE_KEY = 'dashboard:admin:stats';
const CACHE_TTL = 300; // 5 minutes

interface DashboardStats {
  requestsByStatus: Record<string, number>;
  totalDisbursedThisMonth: number;
  pendingActions: {
    awaitingReview: number;
    awaitingVerification: number;
    total: number;
  };
  generatedAt: string;
}

/**
 * GET /admin/dashboard
 * Get admin dashboard statistics
 * Accessible to ADMIN_LEVEL_1 and ADMIN_LEVEL_2
 */
app.get('/dashboard', async (c) => {
  try {
    // Try to serve from cache first
    const cached = await c.env.CACHE.get(CACHE_KEY);
    if (cached) {
      const stats = JSON.parse(cached) as DashboardStats;
      return c.json<ApiResponse<DashboardStats>>({
        success: true,
        data: stats,
      });
    }

    const db = getDb(c.env.DB);

    // 1. Count requests by status
    const statusCounts = await db
      .select({
        status: requests.status,
        count: count(),
      })
      .from(requests)
      .groupBy(requests.status);

    const requestsByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      requestsByStatus[row.status] = row.count;
    }

    // 2. Total disbursed funds for current month (PAID transactions)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const disbursedResult = await db
      .select({ total: sum(transactions.amount) })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'completed'),
          gte(transactions.completedAt, startOfMonth),
          lt(transactions.completedAt, startOfNextMonth)
        )
      )
      .get();

    const totalDisbursedThisMonth = Number(disbursedResult?.total ?? 0);

    // 3. Pending actions:
    //    - SUBMITTED = awaiting review by Admin Level 1
    //    - APPROVED = awaiting verification by Admin Level 2
    const awaitingReview = requestsByStatus[RequestStatus.SUBMITTED] ?? 0;
    const awaitingVerification = requestsByStatus[RequestStatus.APPROVED] ?? 0;

    const stats: DashboardStats = {
      requestsByStatus,
      totalDisbursedThisMonth,
      pendingActions: {
        awaitingReview,
        awaitingVerification,
        total: awaitingReview + awaitingVerification,
      },
      generatedAt: new Date().toISOString(),
    };

    // Cache the result for 5 minutes
    await c.env.CACHE.put(CACHE_KEY, JSON.stringify(stats), { expirationTtl: CACHE_TTL });

    return c.json<ApiResponse<DashboardStats>>({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve dashboard statistics' },
    }, 500);
  }
});

interface FlaggedCase {
  id: string;
  studentId: string;
  type: string;
  amount: number;
  status: string;
  flagReason: string | null;
  submittedAt: Date;
}

interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: string | null;
  ipAddress: string;
  timestamp: Date;
}

interface AnomalyResult {
  type: 'REPEATED_REQUESTS' | 'AMOUNT_OUTLIER';
  requestId: string;
  studentId?: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

interface AuditorDashboard {
  flaggedCases: FlaggedCase[];
  recentAuditLogs: AuditLogEntry[];
  anomalies: AnomalyResult[];
  generatedAt: string;
}

/**
 * GET /admin/auditor-dashboard
 * Get auditor dashboard data
 * Restricted to ADMIN_LEVEL_2 only
 */
app.get('/auditor-dashboard', requireRole(UserRole.ADMIN_LEVEL_2), async (c) => {
  try {
    const db = getDb(c.env.DB);

    // 1. Flagged cases - requests with status FLAGGED
    const flaggedCases = await db
      .select({
        id: requests.id,
        studentId: requests.studentId,
        type: requests.type,
        amount: requests.amount,
        status: requests.status,
        flagReason: requests.flagReason,
        submittedAt: requests.submittedAt,
      })
      .from(requests)
      .where(eq(requests.status, RequestStatus.FLAGGED))
      .orderBy(desc(requests.submittedAt));

    // 2. Recent audit log entries - last 10
    const recentAuditLogs = await db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        timestamp: auditLogs.timestamp,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(10);

    // 3. Anomaly detection

    const anomalies: AnomalyResult[] = [];

    // 3a. Students with more than 3 requests in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const repeatedRequestStudents = await db
      .select({
        studentId: requests.studentId,
        requestCount: count(),
      })
      .from(requests)
      .where(gte(requests.submittedAt, thirtyDaysAgo))
      .groupBy(requests.studentId)
      .having(sql`count(*) > 3`);

    for (const row of repeatedRequestStudents) {
      anomalies.push({
        type: 'REPEATED_REQUESTS',
        requestId: '',
        studentId: row.studentId,
        description: `Student submitted ${row.requestCount} requests in the last 30 days`,
        severity: row.requestCount > 6 ? 'high' : 'medium',
      });
    }

    // 3b. Requests with amounts > 3 standard deviations from the mean per type
    const requestTypes = ['SCHOOL_FEES', 'MEDICAL_EXPENSES', 'SUPPLIES', 'EMERGENCY', 'OTHER'] as const;

    for (const requestType of requestTypes) {
      // Get mean and stddev for this type
      const statsResult = await db
        .select({
          mean: avg(requests.amount),
          stddev: sql<number>`sqrt(avg((${requests.amount} - (select avg(amount) from requests where type = ${requestType})) * (${requests.amount} - (select avg(amount) from requests where type = ${requestType}))))`,
        })
        .from(requests)
        .where(eq(requests.type, requestType))
        .get();

      if (!statsResult || statsResult.mean === null) continue;

      const mean = Number(statsResult.mean);
      const stddev = Number(statsResult.stddev ?? 0);

      if (stddev === 0) continue;

      const threshold = mean + 3 * stddev;

      // Find requests exceeding the threshold
      const outliers = await db
        .select({
          id: requests.id,
          studentId: requests.studentId,
          amount: requests.amount,
        })
        .from(requests)
        .where(
          and(
            eq(requests.type, requestType),
            gte(requests.amount, threshold)
          )
        );

      for (const outlier of outliers) {
        anomalies.push({
          type: 'AMOUNT_OUTLIER',
          requestId: outlier.id,
          studentId: outlier.studentId,
          description: `Request amount ${outlier.amount} is more than 3 standard deviations above the mean (${mean.toFixed(2)}) for type ${requestType}`,
          severity: 'high',
        });
      }
    }

    const dashboard: AuditorDashboard = {
      flaggedCases,
      recentAuditLogs,
      anomalies,
      generatedAt: new Date().toISOString(),
    };

    return c.json<ApiResponse<AuditorDashboard>>({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error('Auditor dashboard error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve auditor dashboard data' },
    }, 500);
  }
});

export default app;

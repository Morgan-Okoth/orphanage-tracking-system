/**
 * Reporting API Handlers
 * Provides AI-assisted monthly reports and anomaly detection results.
 * Restricted to ADMIN_LEVEL_2 only.
 *
 * Requirements: 12.1, 12.2, 12.6, 12.7
 */

import { Hono } from 'hono';
import { getDb } from '../db/client';
import { requests, transactions } from '../db/schema';
import { eq, and, gte, lt, count, sum } from 'drizzle-orm';
import { authMiddleware, requireRole } from '../api/middleware/auth';
import { detectAnomalies } from '../services/anomalyService';
import { generateMonthlySummary } from '../services/aiService';
import type { Env } from '../api/index';
import type { ApiResponse, JWTPayload } from '../types';
import { UserRole, RequestType, RequestStatus } from '../types';
import type { MonthlyReportData } from '../services/aiService';

const app = new Hono<{ Bindings: Env; Variables: { user: JWTPayload } }>();

// All reporting endpoints are restricted to ADMIN_LEVEL_2 only
app.use('*', authMiddleware());
app.use('*', requireRole(UserRole.ADMIN_LEVEL_2));

/**
 * Parse a YYYY-MM string into start/end Date boundaries for that month.
 * Returns null if the string is invalid.
 */
function parseMonthParam(month: string): { start: Date; end: Date; label: string } | null {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const mon = parseInt(match[2], 10);

  if (mon < 1 || mon > 12) return null;

  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);

  const label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return { start, end, label };
}

/**
 * Build MonthlyReportData by querying the DB for the given month range.
 */
async function buildMonthlyReportData(
  db: D1Database,
  start: Date,
  end: Date,
  label: string
): Promise<MonthlyReportData> {
  const orm = getDb(db);

  // Count requests by status for the month
  const statusRows = await orm
    .select({ status: requests.status, cnt: count() })
    .from(requests)
    .where(and(gte(requests.submittedAt, start), lt(requests.submittedAt, end)))
    .groupBy(requests.status);

  let totalRequests = 0;
  let totalApproved = 0;
  let totalRejected = 0;

  const approvedStatuses = new Set<string>([
    RequestStatus.APPROVED,
    RequestStatus.VERIFIED,
    RequestStatus.PAID,
  ]);

  for (const row of statusRows) {
    totalRequests += row.cnt;
    if (approvedStatuses.has(row.status)) totalApproved += row.cnt;
    if (row.status === RequestStatus.REJECTED) totalRejected += row.cnt;
  }

  // Count requests and sum amounts by type for the month
  const typeRows = await orm
    .select({ type: requests.type, cnt: count(), total: sum(requests.amount) })
    .from(requests)
    .where(and(gte(requests.submittedAt, start), lt(requests.submittedAt, end)))
    .groupBy(requests.type);

  const requestsByType: Partial<Record<RequestType, number>> = {};
  const amountsByType: Partial<Record<RequestType, number>> = {};

  for (const row of typeRows) {
    requestsByType[row.type as RequestType] = row.cnt;
    amountsByType[row.type as RequestType] = Number(row.total ?? 0);
  }

  // Total disbursed (completed transactions for PAID requests in the month)
  const disbursedRow = await orm
    .select({ total: sum(transactions.amount) })
    .from(transactions)
    .where(and(gte(transactions.completedAt, start), lt(transactions.completedAt, end), eq(transactions.status, 'completed')))
    .get();

  const totalDisbursed = Number(disbursedRow?.total ?? 0);

  // Total received = sum of all request amounts submitted in the month
  const receivedRow = await orm
    .select({ total: sum(requests.amount) })
    .from(requests)
    .where(and(gte(requests.submittedAt, start), lt(requests.submittedAt, end)))
    .get();

  const totalReceived = Number(receivedRow?.total ?? 0);

  return {
    month: label,
    totalRequests,
    totalApproved,
    totalRejected,
    totalDisbursed,
    totalReceived,
    requestsByType,
    amountsByType,
  };
}

/**
 * GET /reports/monthly?month=YYYY-MM
 * Generate a monthly financial report with an AI-generated summary.
 * Defaults to the current month if no query param is provided.
 * Requirements: 12.1, 12.6
 */
app.get('/monthly', async (c) => {
  try {
    const monthParam = c.req.query('month');

    let start: Date;
    let end: Date;
    let label: string;

    if (monthParam) {
      const parsed = parseMonthParam(monthParam);
      if (!parsed) {
        return c.json<ApiResponse>({
          success: false,
          error: { code: 'INVALID_PARAM', message: 'Invalid month format. Use YYYY-MM (e.g. 2025-01)' },
        }, 400);
      }
      ({ start, end, label } = parsed);
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }

    const reportData = await buildMonthlyReportData(c.env.DB, start, end, label);
    const summary = await generateMonthlySummary(c.env.AI, reportData);

    return c.json<ApiResponse>({
      success: true,
      data: {
        month: label,
        report: reportData,
        summary,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to generate monthly report' },
    }, 500);
  }
});

/**
 * GET /reports/anomalies
 * Run anomaly detection and return results.
 * Requirements: 12.2, 12.7
 */
app.get('/anomalies', async (c) => {
  try {
    const anomalies = await detectAnomalies(c.env.DB);

    return c.json<ApiResponse>({
      success: true,
      data: {
        anomalies,
        count: anomalies.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Anomaly detection error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to run anomaly detection' },
    }, 500);
  }
});

/**
 * POST /reports/generate
 * Generate a custom report based on type and optional month.
 * Body: { type: 'monthly' | 'anomalies', month?: string }
 * Requirements: 12.1, 12.2, 12.6
 */
app.post('/generate', async (c) => {
  try {
    let body: { type?: string; month?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' },
      }, 400);
    }

    const { type, month } = body;

    if (!type || (type !== 'monthly' && type !== 'anomalies')) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'INVALID_PARAM', message: 'type must be "monthly" or "anomalies"' },
      }, 400);
    }

    if (type === 'anomalies') {
      const anomalies = await detectAnomalies(c.env.DB);
      return c.json<ApiResponse>({
        success: true,
        data: {
          type: 'anomalies',
          anomalies,
          count: anomalies.length,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    // type === 'monthly'
    let start: Date;
    let end: Date;
    let label: string;

    if (month) {
      const parsed = parseMonthParam(month);
      if (!parsed) {
        return c.json<ApiResponse>({
          success: false,
          error: { code: 'INVALID_PARAM', message: 'Invalid month format. Use YYYY-MM (e.g. 2025-01)' },
        }, 400);
      }
      ({ start, end, label } = parsed);
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }

    const reportData = await buildMonthlyReportData(c.env.DB, start, end, label);
    const summary = await generateMonthlySummary(c.env.AI, reportData);

    return c.json<ApiResponse>({
      success: true,
      data: {
        type: 'monthly',
        month: label,
        report: reportData,
        summary,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Generate report error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to generate report' },
    }, 500);
  }
});

/**
 * GET /reports/:id/download
 * Placeholder for future PDF/CSV export functionality.
 * Returns 501 Not Implemented for MVP.
 * Requirements: 12.6
 */
app.get('/:id/download', (c) => {
  return c.json<ApiResponse>({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Report download (PDF/CSV export) is not yet implemented',
    },
  }, 501);
});

export default app;

/**
 * Public Transparency API Handlers
 * Provides anonymized financial statistics for public transparency.
 * No authentication required. All data is aggregated and anonymized.
 */

import { Hono } from 'hono';
import { getDb } from '../db/client';
import { publicStatistics } from '../db/schema';
import { desc } from 'drizzle-orm';
import type { Env } from '../api/index';
import type { ApiResponse } from '../types';

const app = new Hono<{ Bindings: Env }>();

const CACHE_TTL = 3600; // 1 hour

/** Shape of a parsed public statistics row */
interface PublicStats {
  date: string;
  totalReceived: number;
  totalDisbursed: number;
  requestsApproved: number;
  requestsRejected: number;
  requestsByType: Record<string, number>;
  amountsByType: Record<string, number>;
  updatedAt: Date;
}

/** Parse a raw DB row into a PublicStats object */
function parseStatsRow(row: {
  date: string;
  totalReceived: number;
  totalDisbursed: number;
  requestsApproved: number;
  requestsRejected: number;
  requestsByType: string;
  amountsByType: string;
  updatedAt: Date;
}): PublicStats {
  return {
    date: row.date,
    totalReceived: row.totalReceived,
    totalDisbursed: row.totalDisbursed,
    requestsApproved: row.requestsApproved,
    requestsRejected: row.requestsRejected,
    requestsByType: JSON.parse(row.requestsByType),
    amountsByType: JSON.parse(row.amountsByType),
    updatedAt: row.updatedAt,
  };
}

/**
 * GET /statistics
 * Returns the most recent aggregated statistics row.
 * Cached for 1 hour.
 */
app.get('/statistics', async (c) => {
  try {
    const cacheKey = 'public:statistics:overall';
    const cached = await c.env.CACHE.get(cacheKey);
    if (cached) {
      return c.json<ApiResponse<PublicStats>>({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const db = getDb(c.env.DB);
    const row = await db
      .select()
      .from(publicStatistics)
      .orderBy(desc(publicStatistics.date))
      .limit(1)
      .get();

    if (!row) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No statistics available yet' },
      }, 404);
    }

    const stats = parseStatsRow(row);
    await c.env.CACHE.put(cacheKey, JSON.stringify(stats), { expirationTtl: CACHE_TTL });

    return c.json<ApiResponse<PublicStats>>({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Public statistics error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve statistics' },
    }, 500);
  }
});

/** Monthly summary shape */
interface MonthlyStats {
  month: string; // e.g. "2024-01"
  totalReceived: number;
  totalDisbursed: number;
  requestsApproved: number;
  requestsRejected: number;
}

/**
 * GET /statistics/monthly
 * Returns statistics grouped by month (YYYY-MM), derived from the date field.
 * Cached for 1 hour.
 */
app.get('/statistics/monthly', async (c) => {
  try {
    const cacheKey = 'public:statistics:monthly';
    const cached = await c.env.CACHE.get(cacheKey);
    if (cached) {
      return c.json<ApiResponse<MonthlyStats[]>>({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const db = getDb(c.env.DB);
    const rows = await db
      .select({
        date: publicStatistics.date,
        totalReceived: publicStatistics.totalReceived,
        totalDisbursed: publicStatistics.totalDisbursed,
        requestsApproved: publicStatistics.requestsApproved,
        requestsRejected: publicStatistics.requestsRejected,
      })
      .from(publicStatistics)
      .orderBy(desc(publicStatistics.date));

    // Group by month (first 7 chars of ISO date: "YYYY-MM")
    const monthMap = new Map<string, MonthlyStats>();
    for (const row of rows) {
      const month = row.date.slice(0, 7);
      const existing = monthMap.get(month);
      if (existing) {
        existing.totalReceived += row.totalReceived;
        existing.totalDisbursed += row.totalDisbursed;
        existing.requestsApproved += row.requestsApproved;
        existing.requestsRejected += row.requestsRejected;
      } else {
        monthMap.set(month, {
          month,
          totalReceived: row.totalReceived,
          totalDisbursed: row.totalDisbursed,
          requestsApproved: row.requestsApproved,
          requestsRejected: row.requestsRejected,
        });
      }
    }

    const monthly = Array.from(monthMap.values());
    await c.env.CACHE.put(cacheKey, JSON.stringify(monthly), { expirationTtl: CACHE_TTL });

    return c.json<ApiResponse<MonthlyStats[]>>({
      success: true,
      data: monthly,
    });
  } catch (error) {
    console.error('Public monthly statistics error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve monthly statistics' },
    }, 500);
  }
});

/** By-type statistics shape */
interface ByTypeStats {
  requestsByType: Record<string, number>;
  amountsByType: Record<string, number>;
  asOf: string;
}

/**
 * GET /statistics/by-type
 * Returns requestsByType and amountsByType from the most recent statistics row.
 * Cached for 1 hour.
 */
app.get('/statistics/by-type', async (c) => {
  try {
    const cacheKey = 'public:statistics:by-type';
    const cached = await c.env.CACHE.get(cacheKey);
    if (cached) {
      return c.json<ApiResponse<ByTypeStats>>({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const db = getDb(c.env.DB);
    const row = await db
      .select({
        date: publicStatistics.date,
        requestsByType: publicStatistics.requestsByType,
        amountsByType: publicStatistics.amountsByType,
      })
      .from(publicStatistics)
      .orderBy(desc(publicStatistics.date))
      .limit(1)
      .get();

    if (!row) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No statistics available yet' },
      }, 404);
    }

    const data: ByTypeStats = {
      requestsByType: JSON.parse(row.requestsByType),
      amountsByType: JSON.parse(row.amountsByType),
      asOf: row.date,
    };

    await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });

    return c.json<ApiResponse<ByTypeStats>>({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Public by-type statistics error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve statistics by type' },
    }, 500);
  }
});

/** Chart data shape for funding visualization */
interface FundingChartData {
  labels: string[]; // e.g. ["2024-01", "2024-02", ...]
  datasets: {
    received: number[];
    disbursed: number[];
    approved: number[];
    rejected: number[];
  };
  trends: {
    received: number | null;  // month-over-month % change
    disbursed: number | null;
  };
}

/**
 * GET /charts/funding
 * Returns funding data formatted for chart visualization.
 * Groups data by month (YYYY-MM) ordered chronologically.
 * Includes month-over-month trends for received and disbursed.
 * Cached for 1 hour.
 */
app.get('/charts/funding', async (c) => {
  try {
    const cacheKey = 'public:charts:funding';
    const cached = await c.env.CACHE.get(cacheKey);
    if (cached) {
      return c.json<ApiResponse<FundingChartData>>({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const db = getDb(c.env.DB);
    const rows = await db
      .select({
        date: publicStatistics.date,
        totalReceived: publicStatistics.totalReceived,
        totalDisbursed: publicStatistics.totalDisbursed,
        requestsApproved: publicStatistics.requestsApproved,
        requestsRejected: publicStatistics.requestsRejected,
      })
      .from(publicStatistics)
      .orderBy(publicStatistics.date); // ascending for chronological order

    // Group by month (YYYY-MM)
    const monthMap = new Map<string, {
      totalReceived: number;
      totalDisbursed: number;
      requestsApproved: number;
      requestsRejected: number;
    }>();

    for (const row of rows) {
      const month = row.date.slice(0, 7);
      const existing = monthMap.get(month);
      if (existing) {
        existing.totalReceived += row.totalReceived;
        existing.totalDisbursed += row.totalDisbursed;
        existing.requestsApproved += row.requestsApproved;
        existing.requestsRejected += row.requestsRejected;
      } else {
        monthMap.set(month, {
          totalReceived: row.totalReceived,
          totalDisbursed: row.totalDisbursed,
          requestsApproved: row.requestsApproved,
          requestsRejected: row.requestsRejected,
        });
      }
    }

    const months = Array.from(monthMap.keys()); // already chronological
    const labels = months;
    const received: number[] = [];
    const disbursed: number[] = [];
    const approved: number[] = [];
    const rejected: number[] = [];

    for (const month of months) {
      const entry = monthMap.get(month)!;
      received.push(entry.totalReceived);
      disbursed.push(entry.totalDisbursed);
      approved.push(entry.requestsApproved);
      rejected.push(entry.requestsRejected);
    }

    // Month-over-month trend: percentage change between last two months
    const calcTrend = (values: number[]): number | null => {
      if (values.length < 2) return null;
      const prev = values[values.length - 2];
      const curr = values[values.length - 1];
      if (prev === 0) return curr === 0 ? 0 : null;
      return Math.round(((curr - prev) / prev) * 10000) / 100; // 2 decimal places
    };

    const data: FundingChartData = {
      labels,
      datasets: { received, disbursed, approved, rejected },
      trends: {
        received: calcTrend(received),
        disbursed: calcTrend(disbursed),
      },
    };

    await c.env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });

    return c.json<ApiResponse<FundingChartData>>({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Public charts funding error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve chart data' },
    }, 500);
  }
});

export default app;

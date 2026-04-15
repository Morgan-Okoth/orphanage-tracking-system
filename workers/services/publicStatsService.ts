/**
 * Public Statistics Aggregation Service
 * Computes and upserts anonymized daily statistics for the public transparency dashboard.
 * Designed to be called by a scheduled Cloudflare Worker (cron trigger).
 *
 * All student information is anonymized — no student IDs or personal data appear in output.
 */

import { D1Database } from '@cloudflare/workers-types';
import { eq, sum, count, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { transactions, requests, publicStatistics } from '../db/schema';
import { RequestStatus, RequestType } from '../types';

/** Shape of the aggregated statistics stored per day */
export interface DailyStats {
  date: string; // ISO date string, e.g. "2024-01-15"
  totalReceived: number;
  totalDisbursed: number;
  requestsApproved: number;
  requestsRejected: number;
  requestsByType: Record<string, number>;
  amountsByType: Record<string, number>;
}

/**
 * Return today's date as an ISO date string (YYYY-MM-DD) in UTC.
 */
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Aggregate public statistics for today and upsert into the public_statistics table.
 *
 * Anonymization guarantee: only aggregate counts and sums are stored.
 * No student IDs, names, or any personally identifiable information are included.
 *
 * @param database - Cloudflare D1 database binding
 * @returns The aggregated DailyStats for today
 */
export async function aggregateStats(database: D1Database): Promise<DailyStats> {
  const db = drizzle(database);
  const date = todayISODate();

  // 1. Total received = sum of all completed transaction amounts
  const receivedResult = await db
    .select({ total: sum(transactions.amount) })
    .from(transactions)
    .where(eq(transactions.status, 'completed'))
    .get();

  const totalReceived = Number(receivedResult?.total ?? 0);

  // 2. Total disbursed = same as total received (funds disbursed to beneficiaries)
  const totalDisbursed = totalReceived;

  // 3. Requests approved = count of requests with status PAID (fully processed)
  const approvedResult = await db
    .select({ count: count() })
    .from(requests)
    .where(eq(requests.status, RequestStatus.PAID))
    .get();

  const requestsApproved = Number(approvedResult?.count ?? 0);

  // 4. Requests rejected = count of requests with status REJECTED
  const rejectedResult = await db
    .select({ count: count() })
    .from(requests)
    .where(eq(requests.status, RequestStatus.REJECTED))
    .get();

  const requestsRejected = Number(rejectedResult?.count ?? 0);

  // 5. Requests by type and amounts by type — only PAID requests, fully anonymized
  const allRequestTypes = Object.values(RequestType);

  const requestsByType: Record<string, number> = {};
  const amountsByType: Record<string, number> = {};

  for (const type of allRequestTypes) {
    const typeResult = await db
      .select({
        count: count(),
        total: sum(requests.amount),
      })
      .from(requests)
      .where(
        and(
          eq(requests.status, RequestStatus.PAID),
          eq(requests.type, type)
        )
      )
      .get();

    requestsByType[type] = Number(typeResult?.count ?? 0);
    amountsByType[type] = Number(typeResult?.total ?? 0);
  }

  const stats: DailyStats = {
    date,
    totalReceived,
    totalDisbursed,
    requestsApproved,
    requestsRejected,
    requestsByType,
    amountsByType,
  };

  // 6. Upsert into public_statistics table (insert or replace for today's date)
  const existing = await db
    .select({ id: publicStatistics.id })
    .from(publicStatistics)
    .where(eq(publicStatistics.date, date))
    .get();

  if (existing) {
    await db
      .update(publicStatistics)
      .set({
        totalReceived: stats.totalReceived,
        totalDisbursed: stats.totalDisbursed,
        requestsApproved: stats.requestsApproved,
        requestsRejected: stats.requestsRejected,
        requestsByType: JSON.stringify(stats.requestsByType),
        amountsByType: JSON.stringify(stats.amountsByType),
        updatedAt: new Date(),
      })
      .where(eq(publicStatistics.date, date));
  } else {
    await db.insert(publicStatistics).values({
      id: crypto.randomUUID(),
      date: stats.date,
      totalReceived: stats.totalReceived,
      totalDisbursed: stats.totalDisbursed,
      requestsApproved: stats.requestsApproved,
      requestsRejected: stats.requestsRejected,
      requestsByType: JSON.stringify(stats.requestsByType),
      amountsByType: JSON.stringify(stats.amountsByType),
      updatedAt: new Date(),
    });
  }

  return stats;
}

/**
 * Anomaly Detection Service
 * Detects suspicious patterns in financial requests for Admin_Level_2 review.
 *
 * Requirements: 12.2, 12.3, 12.4
 */

import { drizzle } from 'drizzle-orm/d1';
import { requests } from '../db/schema';
import { eq, gte, count, avg, sql } from 'drizzle-orm';
import { RequestType } from '../types';

/** All supported request types */
const REQUEST_TYPES = Object.values(RequestType) as RequestType[];

/** Anomaly types detected by this service */
export type AnomalyType = 'REPEATED_REQUESTS' | 'AMOUNT_OUTLIER';

/** Severity levels for detected anomalies */
export type AnomalySeverity = 'low' | 'medium' | 'high';

/**
 * Represents a single detected anomaly.
 * requestId is empty string for REPEATED_REQUESTS anomalies (student-level).
 */
export interface AnomalyResult {
  type: AnomalyType;
  requestId: string;
  studentId: string;
  description: string;
  severity: AnomalySeverity;
  detectedAt: string; // ISO 8601 timestamp
}

/**
 * Detect students who submitted more than 3 requests within the last 30 days.
 * Requirements: 12.2, 12.4
 */
export async function detectRepeatedRequests(db: D1Database): Promise<AnomalyResult[]> {
  const orm = drizzle(db);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const detectedAt = new Date().toISOString();

  const rows = await orm
    .select({
      studentId: requests.studentId,
      requestCount: count(),
    })
    .from(requests)
    .where(gte(requests.submittedAt, thirtyDaysAgo))
    .groupBy(requests.studentId)
    .having(sql`count(*) > 3`);

  return rows.map((row) => ({
    type: 'REPEATED_REQUESTS' as AnomalyType,
    requestId: '',
    studentId: row.studentId,
    description: `Student submitted ${row.requestCount} requests in the last 30 days`,
    severity: row.requestCount > 6 ? 'high' : 'medium',
    detectedAt,
  }));
}

/**
 * Detect requests whose amount is more than 3 standard deviations above the mean
 * for their request type.
 * Requirements: 12.3, 12.4
 */
export async function detectAmountOutliers(db: D1Database): Promise<AnomalyResult[]> {
  const orm = drizzle(db);
  const detectedAt = new Date().toISOString();
  const anomalies: AnomalyResult[] = [];

  for (const requestType of REQUEST_TYPES) {
    // Compute mean and population standard deviation for this type
    const statsRow = await orm
      .select({
        mean: avg(requests.amount),
        stddev: sql<number>`sqrt(avg((${requests.amount} - (select avg(amount) from requests where type = ${requestType})) * (${requests.amount} - (select avg(amount) from requests where type = ${requestType}))))`,
      })
      .from(requests)
      .where(eq(requests.type, requestType))
      .get();

    if (!statsRow || statsRow.mean === null) continue;

    const mean = Number(statsRow.mean);
    const stddev = Number(statsRow.stddev ?? 0);

    // Skip if no variance — all amounts are identical, no outliers possible
    if (stddev === 0) continue;

    const threshold = mean + 3 * stddev;

    // Fetch all requests of this type that exceed the threshold
    const outliers = await orm
      .select({
        id: requests.id,
        studentId: requests.studentId,
        amount: requests.amount,
      })
      .from(requests)
      .where(eq(requests.type, requestType));

    for (const outlier of outliers) {
      if (outlier.amount >= threshold) {
        anomalies.push({
          type: 'AMOUNT_OUTLIER',
          requestId: outlier.id,
          studentId: outlier.studentId,
          description: `Request amount ${outlier.amount} is more than 3 standard deviations above the mean (${mean.toFixed(2)}) for type ${requestType}`,
          severity: 'high',
          detectedAt,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Run all anomaly detection algorithms and return combined results.
 * This is a pure computation — no side effects, no DB writes, no notifications.
 * Requirements: 12.2, 12.3, 12.4
 */
export async function detectAnomalies(db: D1Database): Promise<AnomalyResult[]> {
  const [repeated, outliers] = await Promise.all([
    detectRepeatedRequests(db),
    detectAmountOutliers(db),
  ]);

  return [...repeated, ...outliers];
}

import { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, gte, lte } from 'drizzle-orm';
import { requests, documents, comments, statusChanges } from '../db/schema';
import { RequestStatus, PaginatedResponse } from '../types';

export interface SearchArchivedParams {
  dateFrom?: string;
  dateTo?: string;
  studentId?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  limit?: number;
}

export interface ArchivedRequest {
  id: string;
  studentId: string;
  type: string;
  amount: number;
  reason: string;
  status: string;
  submittedAt: Date | null;
  paidAt: Date | null;
  archivedAt: Date | null;
  documents: any[];
  comments: any[];
  statusHistory: any[];
}

export class ArchivalService {
  /**
   * Returns true if the request is eligible for archival:
   * status === PAID and paidAt is 90+ days ago
   */
  isEligibleForArchival(request: { status: string; paidAt: Date | null | undefined }): boolean {
    if (request.status !== RequestStatus.PAID) return false;
    if (!request.paidAt) return false;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return request.paidAt <= ninetyDaysAgo;
  }

  /**
   * Throws CANNOT_MODIFY_ARCHIVED_REQUEST if the request is already archived.
   * Used to prevent status changes to archived requests (Req 19.3).
   */
  validateNotArchived(request: { status: string }): void {
    if (request.status === RequestStatus.ARCHIVED) {
      throw new Error('CANNOT_MODIFY_ARCHIVED_REQUEST');
    }
  }

  /**
   * Find all PAID requests where paidAt <= 90 days ago,
   * set status to ARCHIVED, set archivedAt = now, and log to audit_logs.
   */
  async archiveEligibleRequests(
    database: D1Database
  ): Promise<{ archivedCount: number; requestIds: string[] }> {
    const db = drizzle(database);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const eligible = await db
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.status, RequestStatus.PAID),
          lte(requests.paidAt, ninetyDaysAgo)
        )
      )
      .all();

    if (eligible.length === 0) {
      return { archivedCount: 0, requestIds: [] };
    }

    const now = new Date();
    const archivedIds: string[] = [];

    for (const request of eligible) {
      await db
        .update(requests)
        .set({ status: RequestStatus.ARCHIVED, archivedAt: now })
        .where(eq(requests.id, request.id));

      // Log to audit_logs using raw D1 (no Context available in scheduled job)
      const auditId = crypto.randomUUID();
      await database
        .prepare(
          `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata, ip_address, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          auditId,
          null,
          'REQUEST_STATUS_CHANGED',
          'Request',
          request.id,
          JSON.stringify({
            fromStatus: RequestStatus.PAID,
            toStatus: RequestStatus.ARCHIVED,
            reason: 'Automatic archival after 90 days',
          }),
          'system',
          now
        )
        .run();

      archivedIds.push(request.id);
    }

    return { archivedCount: archivedIds.length, requestIds: archivedIds };
  }

  /**
   * Search archived requests with optional filters and pagination.
   * Returns full request data with documents, comments, and status history.
   */
  async searchArchivedRequests(
    database: D1Database,
    params: SearchArchivedParams
  ): Promise<PaginatedResponse<ArchivedRequest>> {
    const db = drizzle(database);
    const { dateFrom, dateTo, studentId, minAmount, maxAmount, page = 1, limit = 50 } = params;
    const offset = (page - 1) * limit;

    // Build filter conditions
    const conditions: any[] = [eq(requests.status, RequestStatus.ARCHIVED)];

    if (dateFrom) {
      conditions.push(gte(requests.archivedAt, new Date(dateFrom)));
    }
    if (dateTo) {
      conditions.push(lte(requests.archivedAt, new Date(dateTo)));
    }
    if (studentId) {
      conditions.push(eq(requests.studentId, studentId));
    }
    if (minAmount !== undefined) {
      conditions.push(gte(requests.amount, minAmount));
    }
    if (maxAmount !== undefined) {
      conditions.push(lte(requests.amount, maxAmount));
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const allMatching = await db
      .select()
      .from(requests)
      .where(whereClause)
      .all();

    const total = allMatching.length;
    const paginated = allMatching.slice(offset, offset + limit);

    // Enrich each request with associations
    const items: ArchivedRequest[] = await Promise.all(
      paginated.map((req) => this._enrichRequest(db, req))
    );

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get a single archived request by ID with all associated data.
   * Throws REQUEST_NOT_FOUND if not found, REQUEST_NOT_ARCHIVED if not archived.
   */
  async getArchivedRequestById(
    database: D1Database,
    requestId: string
  ): Promise<ArchivedRequest> {
    const db = drizzle(database);

    const request = await db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    if (request.status !== RequestStatus.ARCHIVED) {
      throw new Error('REQUEST_NOT_ARCHIVED');
    }

    return this._enrichRequest(db, request);
  }

  /**
   * Enrich a request row with its documents, comments, and status history.
   */
  private async _enrichRequest(
    db: ReturnType<typeof drizzle>,
    request: any
  ): Promise<ArchivedRequest> {
    const [docs, commentsList, history] = await Promise.all([
      db.select().from(documents).where(eq(documents.requestId, request.id)).all(),
      db.select().from(comments).where(eq(comments.requestId, request.id)).all(),
      db.select().from(statusChanges).where(eq(statusChanges.requestId, request.id)).all(),
    ]);

    return {
      ...request,
      documents: docs,
      comments: commentsList,
      statusHistory: history,
    };
  }
}

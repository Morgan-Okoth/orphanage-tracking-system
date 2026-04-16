import { D1Database } from '@cloudflare/workers-types';
import { Context } from 'hono';
import { eq, and, or, desc, asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { requests, statusChanges, comments, users } from '../db/schema';
import { RequestStatus, RequestType, UserRole, AuditAction } from '../types';
import { NotificationService } from './notificationService';
import { auditLog } from './auditService';
import { ArchivalService } from './archivalService';

export interface CreateRequestParams {
  studentId: string;
  type: RequestType;
  amount: number;
  reason: string;
}

export interface UpdateRequestParams {
  type?: RequestType;
  amount?: number;
  reason?: string;
}

export interface StatusTransitionParams {
  requestId: string;
  fromStatus: RequestStatus;
  toStatus: RequestStatus;
  changedById: string;
  reason?: string;
}

export interface ListRequestsParams {
  userId: string;
  userRole: UserRole;
  status?: RequestStatus;
  page?: number;
  limit?: number;
}

export interface AddCommentParams {
  requestId: string;
  authorId: string;
  content: string;
  isInternal?: boolean;
}

/**
 * Request management service
 * Handles request lifecycle, status transitions, and workflow operations
 */
export class RequestService {
  private db: ReturnType<typeof drizzle>;
  private notificationService: NotificationService;

  constructor(database: D1Database) {
    this.db = drizzle(database);
    this.notificationService = new NotificationService();
  }

  /**
   * Create a new financial request
   */
  async createRequest(
    params: CreateRequestParams,
    c: Context
  ): Promise<any> {
    const { studentId, type, amount, reason } = params;

    // Validate amount
    if (amount <= 0 || amount > 1000000) {
      throw new Error('INVALID_AMOUNT');
    }

    // Validate amount has max 2 decimal places
    if (!Number.isInteger(amount * 100)) {
      throw new Error('INVALID_AMOUNT_DECIMALS');
    }

    // Create request
    const requestId = crypto.randomUUID();
    await this.db.insert(requests).values({
      id: requestId,
      studentId,
      type,
      amount,
      reason,
      status: RequestStatus.SUBMITTED,
      submittedAt: new Date(),
    });

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: null as any,
      toStatus: RequestStatus.SUBMITTED,
      changedById: studentId,
    });

    // Audit log
    await auditLog(
      studentId,
      AuditAction.REQUEST_CREATED,
      'Request',
      requestId,
      { type, amount, reason },
      c
    );

    // Get created request
    const createdRequest = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    return createdRequest;
  }

  /**
   * Get request by ID
   */
  async getRequestById(requestId: string): Promise<any> {
    const request = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    return request;
  }

  /**
   * List requests with filtering and pagination
   */
  async listRequests(params: ListRequestsParams): Promise<any> {
    const { userId, userRole, status, page = 1, limit = 50 } = params;
    const offset = (page - 1) * limit;

    // Build query based on role
    let query = this.db.select().from(requests);

    // Students can only see their own requests
    if (userRole === UserRole.STUDENT) {
      query = query.where(eq(requests.studentId, userId)) as any;
    }

    // Filter by status if provided
    if (status) {
      if (userRole === UserRole.STUDENT) {
        query = query.where(
          and(
            eq(requests.studentId, userId),
            eq(requests.status, status)
          )
        ) as any;
      } else {
        query = query.where(eq(requests.status, status)) as any;
      }
    }

    // Order by submission date (oldest first for admins, newest first for students)
    if (userRole === UserRole.STUDENT) {
      query = query.orderBy(desc(requests.submittedAt)) as any;
    } else {
      query = query.orderBy(asc(requests.submittedAt)) as any;
    }

    // Get total count
    const allRequests = await query.all();
    const total = allRequests.length;

    // Apply pagination
    const paginatedRequests = allRequests.slice(offset, offset + limit);

    return {
      items: paginatedRequests,
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
   * Update request (draft only)
   */
  async updateRequest(
    requestId: string,
    params: UpdateRequestParams,
    userId: string,
    c: Context
  ): Promise<any> {
    // Get request
    const request = await this.getRequestById(requestId);

    // Only draft requests can be updated
    if (request.status !== RequestStatus.SUBMITTED) {
      throw new Error('REQUEST_NOT_DRAFT');
    }

    // Only the student who created the request can update it
    if (request.studentId !== userId) {
      throw new Error('FORBIDDEN');
    }

    // Validate amount if provided
    if (params.amount !== undefined) {
      if (params.amount <= 0 || params.amount > 1000000) {
        throw new Error('INVALID_AMOUNT');
      }
      if (!Number.isInteger(params.amount * 100)) {
        throw new Error('INVALID_AMOUNT_DECIMALS');
      }
    }

    // Update request
    await this.db
      .update(requests)
      .set({
        ...params,
      })
      .where(eq(requests.id, requestId));

    // Audit log
    await auditLog(
      userId,
      AuditAction.REQUEST_STATUS_CHANGED,
      'Request',
      requestId,
      { action: 'update', changes: params },
      c
    );

    // Get updated request
    return await this.getRequestById(requestId);
  }

  /**
   * Soft delete request (draft only)
   */
  async deleteRequest(
    requestId: string,
    userId: string,
    c: Context
  ): Promise<void> {
    // Get request
    const request = await this.getRequestById(requestId);

    // Only draft requests can be deleted
    if (request.status !== RequestStatus.SUBMITTED) {
      throw new Error('REQUEST_NOT_DRAFT');
    }

    // Only the student who created the request can delete it
    if (request.studentId !== userId) {
      throw new Error('FORBIDDEN');
    }

    // Soft delete by setting status to ARCHIVED
    await this.db
      .update(requests)
      .set({
        status: RequestStatus.ARCHIVED,
        archivedAt: new Date(),
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: request.status,
      toStatus: RequestStatus.ARCHIVED,
      changedById: userId,
      reason: 'Deleted by student',
    });

    // Audit log
    await auditLog(
      userId,
      AuditAction.REQUEST_STATUS_CHANGED,
      'Request',
      requestId,
      { action: 'delete', fromStatus: request.status, toStatus: RequestStatus.ARCHIVED },
      c
    );
  }

  /**
   * Start review (SUBMITTED → UNDER_REVIEW)
   */
  async startReview(
    requestId: string,
    adminId: string,
    c: Context
  ): Promise<any> {
    const request = await this.getRequestById(requestId);

    // Prevent modifications to archived requests (Req 19.3)
    new ArchivalService().validateNotArchived(request);

    // Validate status transition
    if (request.status !== RequestStatus.SUBMITTED) {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    // Update status
    await this.db
      .update(requests)
      .set({
        status: RequestStatus.UNDER_REVIEW,
        reviewedAt: new Date(),
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: request.status,
      toStatus: RequestStatus.UNDER_REVIEW,
      changedById: adminId,
    });

    // Audit log
    await auditLog(
      adminId,
      AuditAction.REQUEST_STATUS_CHANGED,
      'Request',
      requestId,
      { fromStatus: request.status, toStatus: RequestStatus.UNDER_REVIEW },
      c
    );

    // Send notification to student
    await this.sendStatusChangeNotification(
      c.env.DB,
      requestId,
      RequestStatus.UNDER_REVIEW,
      undefined,
      c.env.EMAIL_QUEUE,
      c.env.SMS_QUEUE
    );

    return await this.getRequestById(requestId);
  }

  /**
   * Approve request (UNDER_REVIEW → APPROVED)
   */
  async approveRequest(
    requestId: string,
    adminId: string,
    c: Context
  ): Promise<any> {
    const request = await this.getRequestById(requestId);

    // Prevent modifications to archived requests (Req 19.3)
    new ArchivalService().validateNotArchived(request);

    // Validate status transition
    if (request.status !== RequestStatus.UNDER_REVIEW) {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    // Update status
    await this.db
      .update(requests)
      .set({
        status: RequestStatus.APPROVED,
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: request.status,
      toStatus: RequestStatus.APPROVED,
      changedById: adminId,
    });

    // Audit log
    await auditLog(
      adminId,
      AuditAction.REQUEST_STATUS_CHANGED,
      'Request',
      requestId,
      { fromStatus: request.status, toStatus: RequestStatus.APPROVED },
      c
    );

    // Send notifications to student and Admin Level 2
    await this.sendStatusChangeNotification(
      c.env.DB,
      requestId,
      RequestStatus.APPROVED,
      undefined,
      c.env.EMAIL_QUEUE,
      c.env.SMS_QUEUE
    );
    await this.notifyAdminLevel2(c.env.DB, requestId, c.env.EMAIL_QUEUE);

    return await this.getRequestById(requestId);
  }

  /**
   * Reject request
   */
  async rejectRequest(
    requestId: string,
    adminId: string,
    reason: string,
    c: Context
  ): Promise<any> {
    const request = await this.getRequestById(requestId);

    // Prevent modifications to archived requests (Req 19.3)
    new ArchivalService().validateNotArchived(request);

    // Can reject from UNDER_REVIEW, APPROVED, or VERIFIED
    const validStatuses = [
      RequestStatus.UNDER_REVIEW,
      RequestStatus.APPROVED,
      RequestStatus.VERIFIED,
    ];

    if (!validStatuses.includes(request.status)) {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    // Update status
    await this.db
      .update(requests)
      .set({
        status: RequestStatus.REJECTED,
        rejectionReason: reason,
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: request.status,
      toStatus: RequestStatus.REJECTED,
      changedById: adminId,
      reason,
    });

    // Audit log
    await auditLog(
      adminId,
      AuditAction.REQUEST_STATUS_CHANGED,
      'Request',
      requestId,
      { fromStatus: request.status, toStatus: RequestStatus.REJECTED, reason },
      c
    );

    // Send notification to student
    await this.sendStatusChangeNotification(
      c.env.DB,
      requestId,
      RequestStatus.REJECTED,
      reason,
      c.env.EMAIL_QUEUE,
      c.env.SMS_QUEUE
    );

    return await this.getRequestById(requestId);
  }

  /**
   * Request additional documents (→ PENDING_DOCUMENTS)
   */
  async requestAdditionalDocuments(
    requestId: string,
    adminId: string,
    reason: string,
    c: Context
  ): Promise<any> {
    const request = await this.getRequestById(requestId);

    // Can request documents from UNDER_REVIEW
    if (request.status !== RequestStatus.UNDER_REVIEW) {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    // Update status
    await this.db
      .update(requests)
      .set({
        status: RequestStatus.PENDING_DOCUMENTS,
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: request.status,
      toStatus: RequestStatus.PENDING_DOCUMENTS,
      changedById: adminId,
      reason,
    });

    // Audit log
    await auditLog(
      adminId,
      AuditAction.REQUEST_STATUS_CHANGED,
      'Request',
      requestId,
      { fromStatus: request.status, toStatus: RequestStatus.PENDING_DOCUMENTS, reason },
      c
    );

    // Send notification to student
    await this.sendStatusChangeNotification(
      c.env.DB,
      requestId,
      RequestStatus.PENDING_DOCUMENTS,
      reason,
      c.env.EMAIL_QUEUE,
      c.env.SMS_QUEUE
    );

    return await this.getRequestById(requestId);
  }

  /**
   * Verify request (APPROVED → VERIFIED)
   */
  async verifyRequest(
    requestId: string,
    auditorId: string,
    c: Context
  ): Promise<any> {
    const request = await this.getRequestById(requestId);

    // Prevent modifications to archived requests (Req 19.3)
    new ArchivalService().validateNotArchived(request);

    // Validate status transition
    if (request.status !== RequestStatus.APPROVED) {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    // Update status
    await this.db
      .update(requests)
      .set({
        status: RequestStatus.VERIFIED,
        verifiedAt: new Date(),
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: request.status,
      toStatus: RequestStatus.VERIFIED,
      changedById: auditorId,
    });

    // Audit log
    await auditLog(
      auditorId,
      AuditAction.REQUEST_STATUS_CHANGED,
      'Request',
      requestId,
      { fromStatus: request.status, toStatus: RequestStatus.VERIFIED },
      c
    );

    // Send notification to student and Admin Level 1
    await this.sendStatusChangeNotification(
      c.env.DB,
      requestId,
      RequestStatus.VERIFIED
    );

    return await this.getRequestById(requestId);
  }

  /**
   * Flag request (→ FLAGGED)
   */
  async flagRequest(
    requestId: string,
    auditorId: string,
    reason: string,
    c: Context
  ): Promise<any> {
    const request = await this.getRequestById(requestId);

    // Prevent modifications to archived requests (Req 19.3)
    new ArchivalService().validateNotArchived(request);

    // Can flag from APPROVED or VERIFIED
    const validStatuses = [RequestStatus.APPROVED, RequestStatus.VERIFIED];

    if (!validStatuses.includes(request.status)) {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    // Update status
    await this.db
      .update(requests)
      .set({
        status: RequestStatus.FLAGGED,
        flagReason: reason,
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: request.status,
      toStatus: RequestStatus.FLAGGED,
      changedById: auditorId,
      reason,
    });

    // Audit log
    await auditLog(
      auditorId,
      AuditAction.REQUEST_STATUS_CHANGED,
      'Request',
      requestId,
      { fromStatus: request.status, toStatus: RequestStatus.FLAGGED, reason },
      c
    );

    // Send notification to Admin Level 1
    await this.notifyAdminLevel1(c.env.DB, requestId, reason);

    return await this.getRequestById(requestId);
  }

  /**
   * Add comment to request
   */
  async addComment(
    params: AddCommentParams,
    c: Context
  ): Promise<any> {
    const { requestId, authorId, content, isInternal = false } = params;

    // Verify request exists
    await this.getRequestById(requestId);

    // Create comment
    const commentId = crypto.randomUUID();
    await this.db.insert(comments).values({
      id: commentId,
      requestId,
      authorId,
      content,
      isInternal,
      createdAt: new Date(),
    });

    // Audit log
    await auditLog(
      authorId,
      AuditAction.COMMENT_ADDED,
      'Comment',
      commentId,
      { requestId, isInternal },
      c
    );

    // Get created comment
    const comment = await this.db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .get();

    // Get author details
    const author = await this.db
      .select({ firstName: users.firstName, lastName: users.lastName, role: users.role })
      .from(users)
      .where(eq(users.id, authorId))
      .get();

    // Send notification to relevant parties
    await this.notifyCommentAdded(c.env.DB, requestId, authorId, isInternal);

    return {
      ...comment,
      authorName: author ? `${author.firstName} ${author.lastName}` : 'Unknown',
      authorRole: author?.role,
    };
  }

  /**
   * Get comments for request
   */
  async getComments(
    requestId: string,
    userRole: UserRole
  ): Promise<any[]> {
    // Verify request exists
    await this.getRequestById(requestId);

    // Build query - students cannot see internal comments
    let commentsList: any[];

    if (userRole === UserRole.STUDENT) {
      commentsList = await this.db
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.requestId, requestId),
            eq(comments.isInternal, false)
          )
        )
        .orderBy(asc(comments.createdAt))
        .all();
    } else {
      commentsList = await this.db
        .select()
        .from(comments)
        .where(eq(comments.requestId, requestId))
        .orderBy(asc(comments.createdAt))
        .all();
    }

    // Fetch author details for each comment
    const commentsWithAuthors = await Promise.all(
      commentsList.map(async (comment) => {
        const author = await this.db
          .select({ firstName: users.firstName, lastName: users.lastName, role: users.role })
          .from(users)
          .where(eq(users.id, comment.authorId))
          .get();
        return {
          ...comment,
          authorName: author ? `${author.firstName} ${author.lastName}` : 'Unknown',
          authorRole: author?.role,
        };
      })
    );

    return commentsWithAuthors;
  }

  /**
   * Get status change history
   */
  async getStatusHistory(requestId: string): Promise<any[]> {
    // Verify request exists
    await this.getRequestById(requestId);

    const history = await this.db
      .select()
      .from(statusChanges)
      .where(eq(statusChanges.requestId, requestId))
      .orderBy(asc(statusChanges.changedAt))
      .all();

    // Fetch changer details for each entry
    const historyWithNames = await Promise.all(
      history.map(async (entry) => {
        const changer = await this.db
          .select({ firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.id, entry.changedById))
          .get();
        return {
          ...entry,
          changedByName: changer ? `${changer.firstName} ${changer.lastName}` : 'Unknown',
        };
      })
    );

    return historyWithNames;
  }

  /**
   * Log status change to status_changes table
   */
  private async logStatusChange(params: StatusTransitionParams): Promise<void> {
    const { requestId, fromStatus, toStatus, changedById, reason } = params;

    await this.db.insert(statusChanges).values({
      id: crypto.randomUUID(),
      requestId,
      fromStatus,
      toStatus,
      changedById,
      reason,
      changedAt: new Date(),
    });
  }

  /**
   * Send status change notification to student
   */
  private async sendStatusChangeNotification(
    db: D1Database,
    requestId: string,
    newStatus: RequestStatus,
    reason?: string,
    emailQueue?: Queue,
    smsQueue?: Queue
  ): Promise<void> {
    const request = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) return;

    const student = await this.db
      .select()
      .from(users)
      .where(eq(users.id, request.studentId))
      .get();

    if (!student) return;

    const statusMessages: Record<RequestStatus, string> = {
      [RequestStatus.SUBMITTED]: 'Your request has been submitted successfully.',
      [RequestStatus.UNDER_REVIEW]: 'Your request is now under review.',
      [RequestStatus.PENDING_DOCUMENTS]: `Additional documents are required. ${reason || ''}`,
      [RequestStatus.APPROVED]: 'Your request has been approved!',
      [RequestStatus.VERIFIED]: 'Your request has been verified and payment will be processed soon.',
      [RequestStatus.PAID]: 'Payment has been completed.',
      [RequestStatus.REJECTED]: `Your request has been rejected. Reason: ${reason || 'Not specified'}`,
      [RequestStatus.FLAGGED]: 'Your request has been flagged for review.',
      [RequestStatus.ARCHIVED]: 'Your request has been archived.',
    };

    const subject = `Request Status Update: ${newStatus}`;
    const message = statusMessages[newStatus];

    await this.notificationService.queueEmail(
      db,
      student.id,
      subject,
      message,
      `<p>${message}</p><p>Request ID: ${requestId}</p>`,
      emailQueue
    );
  }

  /**
   * Notify Admin Level 2 of approved request
   */
  private async notifyAdminLevel2(
    db: D1Database,
    requestId: string
  ): Promise<void> {
    // Get all Admin Level 2 users
    const admins = await this.db
      .select()
      .from(users)
      .where(eq(users.role, UserRole.ADMIN_LEVEL_2))
      .all();

    for (const admin of admins) {
      await this.notificationService.queueEmail(
        db,
        admin.id,
        'New Request Awaiting Verification',
        `A new request (${requestId}) has been approved and is awaiting your verification.`,
        `<p>A new request has been approved and is awaiting your verification.</p><p>Request ID: ${requestId}</p>`
      );
    }
  }

  /**
   * Notify Admin Level 1 of flagged request
   */
  private async notifyAdminLevel1(
    db: D1Database,
    requestId: string,
    reason: string
  ): Promise<void> {
    // Get all Admin Level 1 users
    const admins = await this.db
      .select()
      .from(users)
      .where(eq(users.role, UserRole.ADMIN_LEVEL_1))
      .all();

    for (const admin of admins) {
      await this.notificationService.queueEmail(
        db,
        admin.id,
        'Request Flagged',
        `Request ${requestId} has been flagged. Reason: ${reason}`,
        `<p>Request ${requestId} has been flagged for review.</p><p>Reason: ${reason}</p>`
      );
    }
  }

  /**
   * Notify relevant parties when comment is added
   */
  private async notifyCommentAdded(
    db: D1Database,
    requestId: string,
    authorId: string,
    isInternal: boolean
  ): Promise<void> {
    const request = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) return;

    // Notify student if comment is not internal
    if (!isInternal) {
      const student = await this.db
        .select()
        .from(users)
        .where(eq(users.id, request.studentId))
        .get();

      if (student && student.id !== authorId) {
        await this.notificationService.queueEmail(
          db,
          student.id,
          'New Comment on Your Request',
          `A new comment has been added to your request ${requestId}.`,
          `<p>A new comment has been added to your request.</p><p>Request ID: ${requestId}</p>`
        );
      }
    }

    // Notify admins
    const admins = await this.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.role, UserRole.ADMIN_LEVEL_1),
          eq(users.role, UserRole.ADMIN_LEVEL_2)
        )
      )
      .all();

    for (const admin of admins) {
      if (admin.id !== authorId) {
        await this.notificationService.queueEmail(
          db,
          admin.id,
          'New Comment on Request',
          `A new comment has been added to request ${requestId}.`,
          `<p>A new comment has been added to request ${requestId}.</p>`
        );
      }
    }
  }

  /**
   * Raise a dispute for a paid request
   * Student claims they did not receive the funds
   */
  async raiseDispute(
    requestId: string,
    studentId: string,
    reason: string,
    c: Context
  ): Promise<any> {
    const request = await this.getRequestById(requestId);

    // Only students can raise disputes on their own requests
    if (request.studentId !== studentId) {
      throw new Error('FORBIDDEN');
    }

    // Can only dispute PAID requests
    if (request.status !== RequestStatus.PAID) {
      throw new Error('INVALID_STATUS_FOR_DISPUTE');
    }

    // Update request status to DISPUTED
    await this.db
      .update(requests)
      .set({
        status: RequestStatus.DISPUTED,
        disputeReason: reason,
        disputeRaisedAt: new Date(),
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: RequestStatus.PAID,
      toStatus: RequestStatus.DISPUTED,
      changedById: studentId,
      reason: `Dispute raised: ${reason}`,
    });

    // Audit log
    await auditLog(
      studentId,
      AuditAction.DISPUTE_RAISED,
      'Request',
      requestId,
      { reason },
      c
    );

    // Notify admins about the dispute
    await this.notifyAdminsOfDispute(c.env.DB, requestId, reason);

    // Return updated request
    return await this.getRequestById(requestId);
  }

  /**
   * Resolve a dispute (Admin only)
   */
  async resolveDispute(
    requestId: string,
    adminId: string,
    resolution: string,
    action: 'refund' | 'confirm' | 'investigate',
    c: Context
  ): Promise<any> {
    const request = await this.getRequestById(requestId);

    // Can only resolve DISPUTED requests
    if (request.status !== RequestStatus.DISPUTED) {
      throw new Error('INVALID_STATUS_FOR_RESOLUTION');
    }

    let newStatus: RequestStatus;
    let resolutionText: string;

    switch (action) {
      case 'refund':
        newStatus = RequestStatus.RESOLVED;
        resolutionText = `Refund issued: ${resolution}`;
        break;
      case 'confirm':
        newStatus = RequestStatus.PAID;
        resolutionText = `Payment confirmed: ${resolution}`;
        break;
      case 'investigate':
        newStatus = RequestStatus.FLAGGED;
        resolutionText = `Under investigation: ${resolution}`;
        break;
      default:
        throw new Error('INVALID_RESOLUTION_ACTION');
    }

    // Update request
    await this.db
      .update(requests)
      .set({
        status: newStatus,
        disputeResolution: resolutionText,
        disputeResolvedAt: new Date(),
        flagReason: action === 'investigate' ? resolution : request.flagReason,
      })
      .where(eq(requests.id, requestId));

    // Log status change
    await this.logStatusChange({
      requestId,
      fromStatus: RequestStatus.DISPUTED,
      toStatus: newStatus,
      changedById: adminId,
      reason: resolutionText,
    });

    // Audit log
    await auditLog(
      adminId,
      AuditAction.DISPUTE_RESOLVED,
      'Request',
      requestId,
      { action, resolution },
      c
    );

    // Notify student
    await this.notifyDisputeResolution(c.env.DB, requestId, resolutionText);

    return await this.getRequestById(requestId);
  }

  /**
   * Notify admins when a dispute is raised
   */
  private async notifyAdminsOfDispute(
    db: D1Database,
    requestId: string,
    reason: string
  ): Promise<void> {
    const admins = await this.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.role, UserRole.ADMIN_LEVEL_1),
          eq(users.role, UserRole.ADMIN_LEVEL_2),
          eq(users.role, UserRole.SUPERADMIN)
        )
      )
      .all();

    for (const admin of admins) {
      await this.notificationService.queueEmail(
        db,
        admin.id,
        'Payment Dispute Raised',
        `A payment dispute has been raised for request ${requestId}. Reason: ${reason}`,
        `<p><strong>URGENT:</strong> A payment dispute has been raised.</p><p>Request ID: ${requestId}</p><p>Reason: ${reason}</p><p>Please review and resolve immediately.</p>`
      );
    }
  }

  /**
   * Notify student when dispute is resolved
   */
  private async notifyDisputeResolution(
    db: D1Database,
    requestId: string,
    resolution: string
  ): Promise<void> {
    const request = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) return;

    const student = await this.db
      .select()
      .from(users)
      .where(eq(users.id, request.studentId))
      .get();

    if (!student) return;

    await this.notificationService.queueEmail(
      db,
      student.id,
      'Payment Dispute Resolved',
      `Your payment dispute for request ${requestId} has been resolved. ${resolution}`,
      `<p>Your payment dispute has been resolved.</p><p>Request ID: ${requestId}</p><p>Resolution: ${resolution}</p>`
    );
  }
}

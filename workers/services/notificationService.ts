import { notifications, users, requests } from '../db/schema';
import { getDb } from '../db/client';
import { eq } from 'drizzle-orm';
import type { EmailQueueMessage } from '../queues/emailQueue';
import type { SMSQueueMessage } from '../queues/smsQueue';
import { RequestStatus, RequestType } from '../types';
import { QueueService } from './queueService';

export interface EmailNotification {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SMSNotification {
  to: string;
  message: string;
}

export interface NotificationTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface SMSTemplate {
  message: string;
}

export class NotificationService {
  private queueService?: QueueService;

  constructor(queueService?: QueueService) {
    this.queueService = queueService;
  }

  /**
   * Queue email notification for sending
   */
  async queueEmail(
    db: D1Database,
    userId: string,
    subject: string,
    message: string,
    htmlContent?: string,
    emailQueue?: Queue<EmailQueueMessage>
  ): Promise<void> {
    const dbClient = getDb(db);

    // Get user email
    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      throw new Error('User not found');
    }

    const notificationId = crypto.randomUUID();

    // Create notification record
    await dbClient.insert(notifications).values({
      id: notificationId,
      userId,
      type: 'email',
      channel: user.email,
      subject,
      message,
      status: 'pending',
      retryCount: 0,
      metadata: htmlContent ? JSON.stringify({ html: htmlContent }) : null,
      createdAt: new Date(),
    });

    // Send to queue using queue service or direct queue
    const emailMessage: EmailQueueMessage = {
      notificationId,
      userId,
      to: user.email,
      subject,
      text: message,
      html: htmlContent,
    };

    if (this.queueService) {
      await this.queueService.sendEmailToQueue(emailMessage);
    } else if (emailQueue) {
      await emailQueue.send(emailMessage);
    }
  }

  /**
   * Queue SMS notification for sending
   */
  async queueSMS(
    db: D1Database,
    userId: string,
    message: string,
    smsQueue?: Queue<SMSQueueMessage>
  ): Promise<void> {
    const dbClient = getDb(db);

    // Get user phone
    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      throw new Error('User not found');
    }

    const notificationId = crypto.randomUUID();

    // Create notification record
    await dbClient.insert(notifications).values({
      id: notificationId,
      userId,
      type: 'sms',
      channel: user.phone,
      message,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
    });

    // Send to queue using queue service or direct queue
    const smsMessage: SMSQueueMessage = {
      notificationId,
      userId,
      to: user.phone,
      message,
    };

    if (this.queueService) {
      await this.queueService.sendSMSToQueue(smsMessage);
    } else if (smsQueue) {
      await smsQueue.send(smsMessage);
    }
  }

  /**
   * Generate email template for request status changes
   */
  private generateRequestStatusEmailTemplate(
    userName: string,
    requestId: string,
    requestType: RequestType,
    amount: number,
    status: RequestStatus,
    reason?: string
  ): NotificationTemplate {
    const templates: Record<RequestStatus, NotificationTemplate> = {
      [RequestStatus.SUBMITTED]: {
        subject: 'Request Submitted Successfully',
        text: `Dear ${userName},\n\nYour request for ${requestType} has been submitted successfully and is under review.\n\nRequest Details:\n- Request ID: ${requestId.slice(0, 8)}\n- Type: ${requestType}\n- Amount: KES ${amount.toLocaleString()}\n- Status: ${status}\n\nYou will receive updates as your request is processed.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Request Submitted Successfully</h2>
          <p>Dear ${userName},</p>
          <p>Your request for <strong>${requestType}</strong> has been submitted successfully and is under review.</p>
          <div style="background-color: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px;">
            <h3>Request Details:</h3>
            <ul>
              <li><strong>Request ID:</strong> ${requestId.slice(0, 8)}</li>
              <li><strong>Type:</strong> ${requestType}</li>
              <li><strong>Amount:</strong> KES ${amount.toLocaleString()}</li>
              <li><strong>Status:</strong> ${status}</li>
            </ul>
          </div>
          <p>You will receive updates as your request is processed.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      },
      [RequestStatus.UNDER_REVIEW]: {
        subject: 'Request Under Review',
        text: `Dear ${userName},\n\nYour request (${requestId.slice(0, 8)}) is now under review by our administrators.\n\nWe will notify you once the review is complete.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Request Under Review</h2>
          <p>Dear ${userName},</p>
          <p>Your request (<strong>${requestId.slice(0, 8)}</strong>) is now under review by our administrators.</p>
          <p>We will notify you once the review is complete.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      },
      [RequestStatus.APPROVED]: {
        subject: 'Request Approved',
        text: `Dear ${userName},\n\nGreat news! Your request for ${requestType} has been approved.\n\nRequest Details:\n- Request ID: ${requestId.slice(0, 8)}\n- Amount: KES ${amount.toLocaleString()}\n\nYour request is now being verified and payment will be processed soon.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Request Approved</h2>
          <p>Dear ${userName},</p>
          <p>Great news! Your request for <strong>${requestType}</strong> has been approved.</p>
          <div style="background-color: #e8f5e8; padding: 15px; margin: 15px 0; border-radius: 5px;">
            <h3>Request Details:</h3>
            <ul>
              <li><strong>Request ID:</strong> ${requestId.slice(0, 8)}</li>
              <li><strong>Amount:</strong> KES ${amount.toLocaleString()}</li>
            </ul>
          </div>
          <p>Your request is now being verified and payment will be processed soon.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      },
      [RequestStatus.VERIFIED]: {
        subject: 'Request Verified - Payment Processing',
        text: `Dear ${userName},\n\nYour request (${requestId.slice(0, 8)}) has been verified and payment is being processed.\n\nAmount: KES ${amount.toLocaleString()}\n\nYou will receive a confirmation once payment is complete.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Request Verified - Payment Processing</h2>
          <p>Dear ${userName},</p>
          <p>Your request (<strong>${requestId.slice(0, 8)}</strong>) has been verified and payment is being processed.</p>
          <p><strong>Amount:</strong> KES ${amount.toLocaleString()}</p>
          <p>You will receive a confirmation once payment is complete.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      },
      [RequestStatus.PAID]: {
        subject: 'Payment Completed',
        text: `Dear ${userName},\n\nPayment for your request has been completed successfully!\n\nRequest Details:\n- Request ID: ${requestId.slice(0, 8)}\n- Amount: KES ${amount.toLocaleString()}\n- Status: Payment Completed\n\nThank you for using our services.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Payment Completed</h2>
          <p>Dear ${userName},</p>
          <p>Payment for your request has been completed successfully!</p>
          <div style="background-color: #e8f5e8; padding: 15px; margin: 15px 0; border-radius: 5px;">
            <h3>Request Details:</h3>
            <ul>
              <li><strong>Request ID:</strong> ${requestId.slice(0, 8)}</li>
              <li><strong>Amount:</strong> KES ${amount.toLocaleString()}</li>
              <li><strong>Status:</strong> Payment Completed</li>
            </ul>
          </div>
          <p>Thank you for using our services.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      },
      [RequestStatus.REJECTED]: {
        subject: 'Request Update',
        text: `Dear ${userName},\n\nWe regret to inform you that your request (${requestId.slice(0, 8)}) could not be approved at this time.\n\n${reason ? `Reason: ${reason}\n\n` : ''}You may submit a new request with additional information if needed.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Request Update</h2>
          <p>Dear ${userName},</p>
          <p>We regret to inform you that your request (<strong>${requestId.slice(0, 8)}</strong>) could not be approved at this time.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>You may submit a new request with additional information if needed.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      },
      [RequestStatus.FLAGGED]: {
        subject: 'Request Requires Additional Review',
        text: `Dear ${userName},\n\nYour request (${requestId.slice(0, 8)}) requires additional review.\n\n${reason ? `Note: ${reason}\n\n` : ''}We will contact you if additional information is needed.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Request Requires Additional Review</h2>
          <p>Dear ${userName},</p>
          <p>Your request (<strong>${requestId.slice(0, 8)}</strong>) requires additional review.</p>
          ${reason ? `<p><strong>Note:</strong> ${reason}</p>` : ''}
          <p>We will contact you if additional information is needed.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      },
      [RequestStatus.PENDING_DOCUMENTS]: {
        subject: 'Additional Documents Required',
        text: `Dear ${userName},\n\nAdditional documents are required for your request (${requestId.slice(0, 8)}).\n\n${reason ? `Details: ${reason}\n\n` : ''}Please log in to your account and upload the required documents.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Additional Documents Required</h2>
          <p>Dear ${userName},</p>
          <p>Additional documents are required for your request (<strong>${requestId.slice(0, 8)}</strong>).</p>
          ${reason ? `<p><strong>Details:</strong> ${reason}</p>` : ''}
          <p>Please log in to your account and upload the required documents.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      },
      [RequestStatus.ARCHIVED]: {
        subject: 'Request Archived',
        text: `Dear ${userName},\n\nYour request (${requestId.slice(0, 8)}) has been archived.\n\nAll request data remains accessible for your records.\n\nBest regards,\nBethel Rays of Hope`,
        html: `
          <h2>Request Archived</h2>
          <p>Dear ${userName},</p>
          <p>Your request (<strong>${requestId.slice(0, 8)}</strong>) has been archived.</p>
          <p>All request data remains accessible for your records.</p>
          <br>
          <p>Best regards,<br>Bethel Rays of Hope</p>
        `
      }
    };

    return templates[status];
  }

  /**
   * Generate SMS template for request status changes
   */
  private generateRequestStatusSMSTemplate(
    requestId: string,
    status: RequestStatus,
    amount?: number
  ): SMSTemplate {
    const templates: Record<RequestStatus, SMSTemplate> = {
      [RequestStatus.SUBMITTED]: {
        message: `Bethel Rays of Hope: Your request ${requestId.slice(0, 8)} has been submitted and is under review.`
      },
      [RequestStatus.UNDER_REVIEW]: {
        message: `Bethel Rays of Hope: Your request ${requestId.slice(0, 8)} is now under review.`
      },
      [RequestStatus.APPROVED]: {
        message: `Bethel Rays of Hope: Great news! Your request ${requestId.slice(0, 8)} has been approved. Payment processing will begin soon.`
      },
      [RequestStatus.VERIFIED]: {
        message: `Bethel Rays of Hope: Your request ${requestId.slice(0, 8)} has been verified. Payment is being processed.`
      },
      [RequestStatus.PAID]: {
        message: `Bethel Rays of Hope: Payment completed! KES ${amount?.toLocaleString()} has been sent for request ${requestId.slice(0, 8)}.`
      },
      [RequestStatus.REJECTED]: {
        message: `Bethel Rays of Hope: Your request ${requestId.slice(0, 8)} could not be approved. Check your email for details.`
      },
      [RequestStatus.FLAGGED]: {
        message: `Bethel Rays of Hope: Your request ${requestId.slice(0, 8)} requires additional review. We will contact you if needed.`
      },
      [RequestStatus.PENDING_DOCUMENTS]: {
        message: `Bethel Rays of Hope: Additional documents required for request ${requestId.slice(0, 8)}. Please log in to upload.`
      },
      [RequestStatus.ARCHIVED]: {
        message: `Bethel Rays of Hope: Your request ${requestId.slice(0, 8)} has been archived.`
      }
    };

    return templates[status];
  }

  /**
   * Send request status change notification
   */
  async sendRequestStatusNotification(
    db: D1Database,
    requestId: string,
    newStatus: RequestStatus,
    reason?: string,
    emailQueue?: Queue<EmailQueueMessage>,
    smsQueue?: Queue<SMSQueueMessage>
  ): Promise<void> {
    const dbClient = getDb(db);

    // Get request and user details
    const request = await dbClient
      .select({
        id: requests.id,
        studentId: requests.studentId,
        type: requests.type,
        amount: requests.amount,
        status: requests.status,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userPhone: users.phone,
      })
      .from(requests)
      .innerJoin(users, eq(requests.studentId, users.id))
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      throw new Error('Request not found');
    }

    const userName = `${request.userFirstName} ${request.userLastName}`;
    
    // Generate email template
    const emailTemplate = this.generateRequestStatusEmailTemplate(
      userName,
      requestId,
      request.type as RequestType,
      request.amount,
      newStatus,
      reason
    );

    // Send email notification
    await this.queueEmail(
      db,
      request.studentId,
      emailTemplate.subject,
      emailTemplate.text,
      emailTemplate.html,
      emailQueue
    );

    // Send SMS notification for important status changes
    const smsStatuses = [
      RequestStatus.APPROVED,
      RequestStatus.PAID,
      RequestStatus.REJECTED,
      RequestStatus.PENDING_DOCUMENTS
    ];

    if (smsStatuses.includes(newStatus)) {
      const smsTemplate = this.generateRequestStatusSMSTemplate(
        requestId,
        newStatus,
        request.amount
      );

      await this.queueSMS(db, request.studentId, smsTemplate.message, smsQueue);
    }
  }

  /**
   * Send payment confirmation notification
   */
  async sendPaymentConfirmationNotification(
    db: D1Database,
    requestId: string,
    amount: number,
    mpesaReceiptNumber: string,
    emailQueue?: Queue<EmailQueueMessage>,
    smsQueue?: Queue<SMSQueueMessage>
  ): Promise<void> {
    const dbClient = getDb(db);

    // Get request and user details
    const request = await dbClient
      .select({
        studentId: requests.studentId,
        type: requests.type,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userPhone: users.phone,
      })
      .from(requests)
      .innerJoin(users, eq(requests.studentId, users.id))
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      throw new Error('Request not found');
    }

    const userName = `${request.userFirstName} ${request.userLastName}`;

    // Email notification
    const subject = 'Payment Confirmed - Bethel Rays of Hope';
    const text = `Dear ${userName},\n\nYour payment has been processed successfully!\n\nPayment Details:\n- Request ID: ${requestId.slice(0, 8)}\n- Amount: KES ${amount.toLocaleString()}\n- M-Pesa Receipt: ${mpesaReceiptNumber}\n- Request Type: ${request.type}\n\nThank you for using our services.\n\nBest regards,\nBethel Rays of Hope`;
    const html = `
      <h2>Payment Confirmed</h2>
      <p>Dear ${userName},</p>
      <p>Your payment has been processed successfully!</p>
      <div style="background-color: #e8f5e8; padding: 15px; margin: 15px 0; border-radius: 5px;">
        <h3>Payment Details:</h3>
        <ul>
          <li><strong>Request ID:</strong> ${requestId.slice(0, 8)}</li>
          <li><strong>Amount:</strong> KES ${amount.toLocaleString()}</li>
          <li><strong>M-Pesa Receipt:</strong> ${mpesaReceiptNumber}</li>
          <li><strong>Request Type:</strong> ${request.type}</li>
        </ul>
      </div>
      <p>Thank you for using our services.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope</p>
    `;

    await this.queueEmail(db, request.studentId, subject, text, html, emailQueue);

    // SMS notification
    const smsMessage = `Bethel Rays of Hope: Payment confirmed! KES ${amount.toLocaleString()} sent. M-Pesa receipt: ${mpesaReceiptNumber}. Thank you.`;
    await this.queueSMS(db, request.studentId, smsMessage, smsQueue);
  }

  /**
   * Send admin notification for new requests
   */
  async sendAdminNewRequestNotification(
    db: D1Database,
    requestId: string,
    adminUserId: string,
    emailQueue?: Queue<EmailQueueMessage>
  ): Promise<void> {
    const dbClient = getDb(db);

    // Get request and student details
    const request = await dbClient
      .select({
        id: requests.id,
        type: requests.type,
        amount: requests.amount,
        reason: requests.reason,
        submittedAt: requests.submittedAt,
        studentFirstName: users.firstName,
        studentLastName: users.lastName,
        studentEmail: users.email,
      })
      .from(requests)
      .innerJoin(users, eq(requests.studentId, users.id))
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      throw new Error('Request not found');
    }

    const studentName = `${request.studentFirstName} ${request.studentLastName}`;

    const subject = 'New Request Submitted - Action Required';
    const text = `A new financial request has been submitted and requires your review.\n\nRequest Details:\n- Request ID: ${requestId.slice(0, 8)}\n- Student: ${studentName}\n- Type: ${request.type}\n- Amount: KES ${request.amount.toLocaleString()}\n- Reason: ${request.reason}\n- Submitted: ${request.submittedAt?.toLocaleDateString()}\n\nPlease log in to the admin dashboard to review this request.\n\nBest regards,\nBethel Rays of Hope System`;
    const html = `
      <h2>New Request Submitted - Action Required</h2>
      <p>A new financial request has been submitted and requires your review.</p>
      <div style="background-color: #f0f8ff; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #007bff;">
        <h3>Request Details:</h3>
        <ul>
          <li><strong>Request ID:</strong> ${requestId.slice(0, 8)}</li>
          <li><strong>Student:</strong> ${studentName}</li>
          <li><strong>Type:</strong> ${request.type}</li>
          <li><strong>Amount:</strong> KES ${request.amount.toLocaleString()}</li>
          <li><strong>Reason:</strong> ${request.reason}</li>
          <li><strong>Submitted:</strong> ${request.submittedAt?.toLocaleDateString()}</li>
        </ul>
      </div>
      <p>Please log in to the admin dashboard to review this request.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope System</p>
    `;

    await this.queueEmail(db, adminUserId, subject, text, html, emailQueue);
  }

  /**
   * Send admin notification for requests requiring verification
   */
  async sendAdminVerificationNotification(
    db: D1Database,
    requestId: string,
    auditorUserId: string,
    emailQueue?: Queue<EmailQueueMessage>
  ): Promise<void> {
    const dbClient = getDb(db);

    // Get request and student details
    const request = await dbClient
      .select({
        id: requests.id,
        type: requests.type,
        amount: requests.amount,
        approvedAt: requests.reviewedAt,
        studentFirstName: users.firstName,
        studentLastName: users.lastName,
      })
      .from(requests)
      .innerJoin(users, eq(requests.studentId, users.id))
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      throw new Error('Request not found');
    }

    const studentName = `${request.studentFirstName} ${request.studentLastName}`;

    const subject = 'Request Verification Required';
    const text = `A request has been approved and requires verification before payment.\n\nRequest Details:\n- Request ID: ${requestId.slice(0, 8)}\n- Student: ${studentName}\n- Type: ${request.type}\n- Amount: KES ${request.amount.toLocaleString()}\n- Approved: ${request.approvedAt?.toLocaleDateString()}\n\nPlease log in to the auditor dashboard to verify this request.\n\nBest regards,\nBethel Rays of Hope System`;
    const html = `
      <h2>Request Verification Required</h2>
      <p>A request has been approved and requires verification before payment.</p>
      <div style="background-color: #fff3cd; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #ffc107;">
        <h3>Request Details:</h3>
        <ul>
          <li><strong>Request ID:</strong> ${requestId.slice(0, 8)}</li>
          <li><strong>Student:</strong> ${studentName}</li>
          <li><strong>Type:</strong> ${request.type}</li>
          <li><strong>Amount:</strong> KES ${request.amount.toLocaleString()}</li>
          <li><strong>Approved:</strong> ${request.approvedAt?.toLocaleDateString()}</li>
        </ul>
      </div>
      <p>Please log in to the auditor dashboard to verify this request.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope System</p>
    `;

    await this.queueEmail(db, auditorUserId, subject, text, html, emailQueue);
  }

  /**
   * Send comment notification to relevant parties
   */
  async sendCommentNotification(
    db: D1Database,
    requestId: string,
    commentAuthorId: string,
    commentContent: string,
    isInternal: boolean,
    emailQueue?: Queue<EmailQueueMessage>
  ): Promise<void> {
    const dbClient = getDb(db);

    // Get request, student, and comment author details
    const requestData = await dbClient
      .select({
        studentId: requests.studentId,
        studentFirstName: users.firstName,
        studentLastName: users.lastName,
        studentEmail: users.email,
      })
      .from(requests)
      .innerJoin(users, eq(requests.studentId, users.id))
      .where(eq(requests.id, requestId))
      .get();

    if (!requestData) {
      throw new Error('Request not found');
    }

    // Get comment author details
    const author = await dbClient
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, commentAuthorId))
      .get();

    if (!author) {
      throw new Error('Comment author not found');
    }

    const authorName = `${author.firstName} ${author.lastName}`;
    const studentName = `${requestData.studentFirstName} ${requestData.studentLastName}`;

    // Notify student if comment is not internal and author is not the student
    if (!isInternal && commentAuthorId !== requestData.studentId) {
      const subject = 'New Comment on Your Request';
      const text = `Dear ${studentName},\n\nA new comment has been added to your request (${requestId.slice(0, 8)}).\n\nComment by ${authorName}:\n"${commentContent}"\n\nPlease log in to your account to view the full conversation.\n\nBest regards,\nBethel Rays of Hope`;
      const html = `
        <h2>New Comment on Your Request</h2>
        <p>Dear ${studentName},</p>
        <p>A new comment has been added to your request (<strong>${requestId.slice(0, 8)}</strong>).</p>
        <div style="background-color: #f8f9fa; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #6c757d;">
          <p><strong>Comment by ${authorName}:</strong></p>
          <p>"${commentContent}"</p>
        </div>
        <p>Please log in to your account to view the full conversation.</p>
        <br>
        <p>Best regards,<br>Bethel Rays of Hope</p>
      `;

      await this.queueEmail(db, requestData.studentId, subject, text, html, emailQueue);
    }

    // TODO: Notify other admins if needed (implement based on business rules)
  }
  async sendRegistrationNotification(
    db: D1Database,
    userId: string,
    userName: string,
    emailQueue?: Queue<EmailQueueMessage>
  ): Promise<void> {
    const subject = 'Registration Successful - Awaiting Approval';
    const text = `Dear ${userName},\n\nYour registration has been received successfully. Your account is currently pending approval from an administrator.\n\nYou will receive an email notification once your account has been reviewed.\n\nBest regards,\nBethel Rays of Hope`;
    const html = `
      <h2>Registration Successful</h2>
      <p>Dear ${userName},</p>
      <p>Your registration has been received successfully. Your account is currently <strong>pending approval</strong> from an administrator.</p>
      <p>You will receive an email notification once your account has been reviewed.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope</p>
    `;

    await this.queueEmail(db, userId, subject, text, html, emailQueue);
  }

  /**
   * Send user approval notification
   */
  async sendApprovalNotification(
    db: D1Database,
    userId: string,
    userName: string,
    emailQueue?: Queue<EmailQueueMessage>,
    smsQueue?: Queue<SMSQueueMessage>
  ): Promise<void> {
    const subject = 'Account Approved - Welcome to Bethel Rays of Hope';
    const text = `Dear ${userName},\n\nGreat news! Your account has been approved and is now active.\n\nYou can now log in to the system and start submitting financial requests.\n\nBest regards,\nBethel Rays of Hope`;
    const html = `
      <h2>Account Approved</h2>
      <p>Dear ${userName},</p>
      <p>Great news! Your account has been <strong>approved</strong> and is now active.</p>
      <p>You can now log in to the system and start submitting financial requests.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope</p>
    `;

    await this.queueEmail(db, userId, subject, text, html, emailQueue);

    // Also send SMS notification
    const smsMessage = `Bethel Rays of Hope: Your account has been approved! You can now log in and submit requests.`;
    await this.queueSMS(db, userId, smsMessage, smsQueue);
  }

  /**
   * Send user rejection notification
   */
  async sendRejectionNotification(
    db: D1Database,
    userId: string,
    userName: string,
    reason: string,
    emailQueue?: Queue<EmailQueueMessage>
  ): Promise<void> {
    const subject = 'Account Registration - Update';
    const text = `Dear ${userName},\n\nThank you for your interest in Bethel Rays of Hope.\n\nUnfortunately, we are unable to approve your account registration at this time.\n\nReason: ${reason}\n\nIf you have any questions, please contact our support team.\n\nBest regards,\nBethel Rays of Hope`;
    const html = `
      <h2>Account Registration Update</h2>
      <p>Dear ${userName},</p>
      <p>Thank you for your interest in Bethel Rays of Hope.</p>
      <p>Unfortunately, we are unable to approve your account registration at this time.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>If you have any questions, please contact our support team.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope</p>
    `;

    await this.queueEmail(db, userId, subject, text, html, emailQueue);
  }

  /**
   * Send account deactivation notification
   */
  async sendDeactivationNotification(
    db: D1Database,
    userId: string,
    userName: string,
    emailQueue?: Queue<EmailQueueMessage>
  ): Promise<void> {
    const subject = 'Account Deactivated';
    const text = `Dear ${userName},\n\nYour account has been deactivated by an administrator.\n\nIf you believe this is an error, please contact our support team.\n\nBest regards,\nBethel Rays of Hope`;
    const html = `
      <h2>Account Deactivated</h2>
      <p>Dear ${userName},</p>
      <p>Your account has been deactivated by an administrator.</p>
      <p>If you believe this is an error, please contact our support team.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope</p>
    `;

    await this.queueEmail(db, userId, subject, text, html, emailQueue);
  }

  /**
   * Send account reactivation notification
   */
  async sendReactivationNotification(
    db: D1Database,
    userId: string,
    userName: string,
    emailQueue?: Queue<EmailQueueMessage>,
    smsQueue?: Queue<SMSQueueMessage>
  ): Promise<void> {
    const subject = 'Account Reactivated';
    const text = `Dear ${userName},\n\nYour account has been reactivated. You can now log in and access the system.\n\nBest regards,\nBethel Rays of Hope`;
    const html = `
      <h2>Account Reactivated</h2>
      <p>Dear ${userName},</p>
      <p>Your account has been <strong>reactivated</strong>. You can now log in and access the system.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope</p>
    `;

    await this.queueEmail(db, userId, subject, text, html, emailQueue);

    // Also send SMS notification
    const smsMessage = `Bethel Rays of Hope: Your account has been reactivated. You can now log in.`;
    await this.queueSMS(db, userId, smsMessage, smsQueue);
  }
}

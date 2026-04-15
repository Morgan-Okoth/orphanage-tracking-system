import { D1Database } from '@cloudflare/workers-types';
import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { transactions, requests, users } from '../db/schema';
import { RequestStatus, AuditAction } from '../types';
import { NotificationService } from './notificationService';
import { auditLog } from './auditService';

interface IntaSendConfig {
  secretKey: string;
  callbackUrl: string;
  webhookChallenge?: string;
  deviceId?: string;
}

interface IntaSendInitiateTransaction {
  transaction_id?: string;
  request_reference_id?: string;
  provider_reference?: string;
  account?: string;
  amount?: string | number;
  status?: string;
  status_code?: string;
}

interface IntaSendInitiateResponse {
  tracking_id?: string;
  status?: string;
  status_code?: string;
  transactions?: IntaSendInitiateTransaction[];
  [key: string]: unknown;
}

interface IntaSendWebhookTransaction {
  transaction_id?: string;
  status?: string;
  status_code?: string;
  status_description?: string;
  request_reference_id?: string;
  provider?: string;
  provider_reference?: string;
  account?: string;
  amount?: string | number;
  currency?: string;
}

interface IntaSendWebhookPayload {
  tracking_id?: string;
  status?: string;
  status_code?: string;
  challenge?: string;
  transactions?: IntaSendWebhookTransaction[];
  [key: string]: unknown;
}

export class PaymentService {
  private db: ReturnType<typeof drizzle>;
  private config: IntaSendConfig;
  private readonly baseUrl = 'https://api.intasend.com/api/v1';
  private notificationService: NotificationService;

  constructor(database: D1Database, env: any) {
    this.db = drizzle(database);
    this.notificationService = new NotificationService();
    this.config = {
      secretKey: env.INTASEND_SECRET_KEY,
      callbackUrl: env.INTASEND_CALLBACK_URL,
      webhookChallenge: env.INTASEND_WEBHOOK_CHALLENGE,
      deviceId: env.INTASEND_DEVICE_ID,
    };

    if (!this.config.secretKey) {
      throw new Error('INTASEND_NOT_CONFIGURED');
    }
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  private normalizeKenyanPhone(phoneNumber: string): string {
    return phoneNumber.trim().replace(/^\+/, '').replace(/^0/, '254');
  }

  private async requestIntaSend<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IntaSend API error: ${response.status} - ${errorText}`);
    }

    return (await response.json()) as T;
  }

  private async initiateSendMoney(
    phoneNumber: string,
    amount: number,
    requestId: string,
    studentName: string,
  ): Promise<IntaSendInitiateResponse> {
    const account = this.normalizeKenyanPhone(phoneNumber);
    const requestReferenceId = crypto.randomUUID();

    const payload: Record<string, unknown> = {
      currency: 'KES',
      provider: 'MPESA-B2C',
      callback_url: this.config.callbackUrl,
      requires_approval: 'NO',
      transactions: [
        {
          name: studentName,
          account,
          amount: Math.round(amount * 100) / 100,
          narrative: `Request payout ${requestId.slice(0, 12)}`,
          currency: 'KES',
          country: 'KE',
          request_reference_id: requestReferenceId,
        },
      ],
    };

    if (this.config.deviceId) {
      payload.device_id = this.config.deviceId;
    }

    return this.requestIntaSend<IntaSendInitiateResponse>(
      '/send-money/initiate/',
      payload,
    );
  }

  async initiatePayment(
    requestId: string,
    phoneNumber: string,
    initiatedById: string,
    c: Context,
  ): Promise<any> {
    const request = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    if (request.status !== RequestStatus.VERIFIED) {
      throw new Error('REQUEST_NOT_VERIFIED');
    }

    const existingTransaction = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.requestId, requestId))
      .get();

    if (existingTransaction) {
      throw new Error('PAYMENT_ALREADY_EXISTS');
    }

    const student = await this.db
      .select()
      .from(users)
      .where(eq(users.id, request.studentId))
      .get();

    if (!student) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    const transactionId = crypto.randomUUID();

    try {
      const intaSendResponse = await this.initiateSendMoney(
        phoneNumber,
        request.amount,
        requestId,
        `${student.firstName} ${student.lastName}`.trim(),
      );

      const trackingId =
        intaSendResponse.tracking_id ||
        intaSendResponse.transactions?.[0]?.transaction_id;

      if (!trackingId) {
        throw new Error('INTASEND_TRACKING_ID_MISSING');
      }

      await this.db.insert(transactions).values({
        id: transactionId,
        requestId,
        amount: request.amount,
        currency: 'KES',
        mpesaTransactionId: trackingId,
        phoneNumber: this.normalizeKenyanPhone(phoneNumber),
        status: 'pending',
        initiatedAt: new Date(),
        metadata: JSON.stringify({
          provider: 'INTASEND',
          initiatedBy: initiatedById,
          intaSendResponse,
        }),
      });

      await auditLog(
        initiatedById,
        AuditAction.PAYMENT_INITIATED,
        'Transaction',
        transactionId,
        {
          requestId,
          amount: request.amount,
          phoneNumber,
          intasendTrackingId: trackingId,
        },
        c,
      );

      return {
        transactionId,
        intasendTrackingId: trackingId,
        status: 'pending',
        amount: request.amount,
        message:
          typeof intaSendResponse.status === 'string'
            ? `IntaSend payout request created: ${intaSendResponse.status}`
            : 'IntaSend payout request created successfully',
      };
    } catch (error) {
      await auditLog(
        initiatedById,
        AuditAction.PAYMENT_FAILED,
        'Transaction',
        transactionId,
        {
          requestId,
          amount: request.amount,
          phoneNumber,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        c,
      );

      throw error;
    }
  }

  async handleCallback(
    callbackData: IntaSendWebhookPayload,
    c: Context,
  ): Promise<void> {
    if (
      this.config.webhookChallenge &&
      callbackData.challenge &&
      callbackData.challenge !== this.config.webhookChallenge
    ) {
      throw new Error('INVALID_WEBHOOK_CHALLENGE');
    }

    const trackingId = callbackData.tracking_id;
    if (!trackingId) {
      throw new Error('MISSING_TRACKING_ID');
    }

    const transaction = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.mpesaTransactionId, trackingId))
      .get();

    if (!transaction) {
      console.error('Transaction not found for IntaSend tracking ID:', trackingId);
      return;
    }

    const payout = callbackData.transactions?.[0];
    const providerReference = payout?.provider_reference;
    const statusCode = payout?.status_code ?? callbackData.status_code;
    const status = payout?.status ?? callbackData.status;
    const isSuccess =
      statusCode === 'TS100' ||
      String(status).toLowerCase() === 'successful' ||
      String(status).toLowerCase() === 'completed';

    if (isSuccess) {
      await this.db
        .update(transactions)
        .set({
          status: 'completed',
          mpesaReceiptNumber: providerReference ?? transaction.mpesaReceiptNumber,
          completedAt: new Date(),
          metadata: JSON.stringify({
            ...JSON.parse(transaction.metadata || '{}'),
            callbackData,
          }),
        })
        .where(eq(transactions.id, transaction.id));

      await this.db
        .update(requests)
        .set({
          status: RequestStatus.PAID,
          paidAt: new Date(),
        })
        .where(eq(requests.id, transaction.requestId));

      const request = await this.db
        .select()
        .from(requests)
        .where(eq(requests.id, transaction.requestId))
        .get();

      if (request) {
        const student = await this.db
          .select()
          .from(users)
          .where(eq(users.id, request.studentId))
          .get();

        if (student) {
          await this.sendPaymentConfirmation(
            student.id,
            student.firstName,
            request.amount,
            providerReference ?? trackingId,
            c.env.DB,
          );
        }
      }

      await auditLog(
        null,
        AuditAction.PAYMENT_COMPLETED,
        'Transaction',
        transaction.id,
        {
          requestId: transaction.requestId,
          amount: transaction.amount,
          intasendTrackingId: trackingId,
          providerReference,
          statusCode,
        },
        c,
      );
    } else {
      const failureReason =
        payout?.status_description ||
        String(status) ||
        'IntaSend payout failed';

      await this.db
        .update(transactions)
        .set({
          status: 'failed',
          failureReason,
          metadata: JSON.stringify({
            ...JSON.parse(transaction.metadata || '{}'),
            callbackData,
          }),
        })
        .where(eq(transactions.id, transaction.id));

      await auditLog(
        null,
        AuditAction.PAYMENT_FAILED,
        'Transaction',
        transaction.id,
        {
          requestId: transaction.requestId,
          amount: transaction.amount,
          intasendTrackingId: trackingId,
          statusCode,
          failureReason,
        },
        c,
      );
    }
  }

  async getPaymentById(transactionId: string): Promise<any> {
    const transaction = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .get();

    if (!transaction) {
      throw new Error('TRANSACTION_NOT_FOUND');
    }

    return {
      id: transaction.id,
      requestId: transaction.requestId,
      amount: transaction.amount,
      currency: transaction.currency,
      intasendTrackingId: transaction.mpesaTransactionId,
      providerReference: transaction.mpesaReceiptNumber,
      phoneNumber: transaction.phoneNumber,
      status: transaction.status,
      initiatedAt: transaction.initiatedAt,
      completedAt: transaction.completedAt,
      failureReason: transaction.failureReason,
    };
  }

  async getPaymentByRequestId(requestId: string): Promise<any> {
    const transaction = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.requestId, requestId))
      .get();

    if (!transaction) {
      throw new Error('TRANSACTION_NOT_FOUND');
    }

    return {
      id: transaction.id,
      requestId: transaction.requestId,
      amount: transaction.amount,
      currency: transaction.currency,
      intasendTrackingId: transaction.mpesaTransactionId,
      providerReference: transaction.mpesaReceiptNumber,
      phoneNumber: transaction.phoneNumber,
      status: transaction.status,
      initiatedAt: transaction.initiatedAt,
      completedAt: transaction.completedAt,
      failureReason: transaction.failureReason,
    };
  }

  async listPayments(page: number = 1, limit: number = 50): Promise<any> {
    const offset = (page - 1) * limit;
    const allTransactions = await this.db
      .select()
      .from(transactions)
      .orderBy(transactions.initiatedAt)
      .all();

    const paginatedTransactions = allTransactions.slice(offset, offset + limit);

    return {
      items: paginatedTransactions.map((t) => ({
        id: t.id,
        requestId: t.requestId,
        amount: t.amount,
        currency: t.currency,
        intasendTrackingId: t.mpesaTransactionId,
        providerReference: t.mpesaReceiptNumber,
        phoneNumber: t.phoneNumber,
        status: t.status,
        initiatedAt: t.initiatedAt,
        completedAt: t.completedAt,
        failureReason: t.failureReason,
      })),
      pagination: {
        page,
        limit,
        total: allTransactions.length,
        totalPages: Math.ceil(allTransactions.length / limit),
        hasNext: offset + limit < allTransactions.length,
        hasPrev: page > 1,
      },
    };
  }

  private async sendPaymentConfirmation(
    userId: string,
    userName: string,
    amount: number,
    providerReference: string,
    db: D1Database,
  ): Promise<void> {
    const subject = 'Payment Confirmed - Bethel Rays of Hope';
    const text = `Dear ${userName},\n\nYour payout has been confirmed through IntaSend.\n\nAmount: KES ${amount.toFixed(2)}\nReference: ${providerReference}\n\nThank you for your patience.\n\nBest regards,\nBethel Rays of Hope`;
    const html = `
      <h2>Payment Confirmed</h2>
      <p>Dear ${userName},</p>
      <p>Your payout has been confirmed through <strong>IntaSend</strong>.</p>
      <p><strong>Amount:</strong> KES ${amount.toFixed(2)}</p>
      <p><strong>Reference:</strong> ${providerReference}</p>
      <p>Thank you for your patience.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope</p>
    `;

    await this.notificationService.queueEmail(db, userId, subject, text, html);
    await this.notificationService.queueSMS(
      db,
      userId,
      `Payment confirmed! KES ${amount.toFixed(2)} sent via IntaSend. Reference: ${providerReference}. Thank you.`,
    );
  }
}

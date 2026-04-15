import { D1Database } from '@cloudflare/workers-types';
import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { transactions, requests, users } from '../db/schema';
import { RequestStatus, AuditAction } from '../types';
import { NotificationService } from './notificationService';
import { auditLog } from './auditService';

/**
 * M-Pesa configuration interface
 */
interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
}

/**
 * M-Pesa STK Push response interface
 */
interface MpesaSTKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/**
 * M-Pesa callback data interface
 */
interface MpesaCallbackData {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

/**
 * Payment service for M-Pesa integration
 * Handles payment initiation, callback processing, and transaction management
 */
export class PaymentService {
  private db: ReturnType<typeof drizzle>;
  private config: MpesaConfig;
  private baseUrl = 'https://api.safaricom.co.ke';
  private notificationService: NotificationService;

  constructor(database: D1Database, env: any) {
    this.db = drizzle(database);
    this.notificationService = new NotificationService();
    
    // Load M-Pesa configuration from environment variables
    this.config = {
      consumerKey: env.MPESA_CONSUMER_KEY,
      consumerSecret: env.MPESA_CONSUMER_SECRET,
      shortcode: env.MPESA_SHORTCODE,
      passkey: env.MPESA_PASSKEY,
      callbackUrl: env.MPESA_CALLBACK_URL,
    };

    // Validate configuration
    if (!this.config.consumerKey || !this.config.consumerSecret) {
      throw new Error('M-Pesa credentials not configured');
    }
  }

  /**
   * Generate OAuth access token for M-Pesa API
   */
  async getAccessToken(): Promise<string> {
    try {
      const auth = btoa(`${this.config.consumerKey}:${this.config.consumerSecret}`);
      
      const response = await fetch(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`M-Pesa OAuth failed: ${errorText}`);
      }

      const data = await response.json() as { access_token: string };
      return data.access_token;
    } catch (error) {
      console.error('M-Pesa OAuth error:', error);
      throw new Error('Failed to authenticate with M-Pesa API');
    }
  }

  /**
   * Initiate STK Push payment request
   */
  async initiateSTKPush(
    phoneNumber: string,
    amount: number,
    accountReference: string,
    transactionDesc: string
  ): Promise<MpesaSTKPushResponse> {
    try {
      const token = await this.getAccessToken();
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      const password = btoa(`${this.config.shortcode}${this.config.passkey}${timestamp}`);

      // Format phone number (remove + and ensure it starts with 254)
      const formattedPhone = phoneNumber.replace(/^\+/, '').replace(/^0/, '254');

      const response = await fetch(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            BusinessShortCode: this.config.shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.round(amount), // M-Pesa requires integer amount
            PartyA: formattedPhone,
            PartyB: this.config.shortcode,
            PhoneNumber: formattedPhone,
            CallBackURL: this.config.callbackUrl,
            AccountReference: accountReference,
            TransactionDesc: transactionDesc,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`M-Pesa STK Push failed: ${errorText}`);
      }

      const data = await response.json() as MpesaSTKPushResponse;
      
      // Check if request was successful
      if (data.ResponseCode !== '0') {
        throw new Error(`M-Pesa error: ${data.ResponseDescription}`);
      }

      return data;
    } catch (error) {
      console.error('M-Pesa STK Push error:', error);
      throw error;
    }
  }

  /**
   * Initiate payment for a verified request
   */
  async initiatePayment(
    requestId: string,
    phoneNumber: string,
    initiatedById: string,
    c: Context
  ): Promise<any> {
    // Get request details
    const request = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .get();

    if (!request) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    // Validate request status
    if (request.status !== RequestStatus.VERIFIED) {
      throw new Error('REQUEST_NOT_VERIFIED');
    }

    // Check if payment already exists
    const existingTransaction = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.requestId, requestId))
      .get();

    if (existingTransaction) {
      throw new Error('PAYMENT_ALREADY_EXISTS');
    }

    // Get student details
    const student = await this.db
      .select()
      .from(users)
      .where(eq(users.id, request.studentId))
      .get();

    if (!student) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    // Create transaction record with pending status
    const transactionId = crypto.randomUUID();
    
    try {
      // Initiate M-Pesa STK Push
      const mpesaResponse = await this.initiateSTKPush(
        phoneNumber,
        request.amount,
        requestId.slice(0, 12), // Account reference (max 12 chars)
        `Payment for ${request.type}`
      );

      // Store transaction record
      await this.db.insert(transactions).values({
        id: transactionId,
        requestId,
        amount: request.amount,
        currency: 'KES',
        mpesaTransactionId: mpesaResponse.CheckoutRequestID,
        phoneNumber,
        status: 'pending',
        initiatedAt: new Date(),
        metadata: JSON.stringify({
          merchantRequestId: mpesaResponse.MerchantRequestID,
          checkoutRequestId: mpesaResponse.CheckoutRequestID,
          initiatedBy: initiatedById,
        }),
      });

      // Audit log
      await auditLog(
        initiatedById,
        AuditAction.PAYMENT_INITIATED,
        'Transaction',
        transactionId,
        {
          requestId,
          amount: request.amount,
          phoneNumber,
          mpesaCheckoutRequestId: mpesaResponse.CheckoutRequestID,
        },
        c
      );

      return {
        transactionId,
        mpesaCheckoutRequestId: mpesaResponse.CheckoutRequestID,
        status: 'pending',
        amount: request.amount,
        message: mpesaResponse.CustomerMessage,
      };
    } catch (error) {
      // Log payment failure
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
        c
      );

      throw error;
    }
  }

  /**
   * Handle M-Pesa callback webhook
   */
  async handleCallback(
    callbackData: MpesaCallbackData,
    c: Context
  ): Promise<void> {
    const { Body } = callbackData;
    const { stkCallback } = Body;

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;

    // Find transaction by M-Pesa checkout request ID
    const transaction = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.mpesaTransactionId, checkoutRequestId))
      .get();

    if (!transaction) {
      console.error('Transaction not found for checkout request:', checkoutRequestId);
      return;
    }

    if (resultCode === 0) {
      // Payment successful
      const metadata = stkCallback.CallbackMetadata?.Item || [];
      const mpesaReceiptNumber = metadata.find(
        (item) => item.Name === 'MpesaReceiptNumber'
      )?.Value as string;

      // Update transaction status
      await this.db
        .update(transactions)
        .set({
          status: 'completed',
          mpesaReceiptNumber,
          completedAt: new Date(),
          metadata: JSON.stringify({
            ...JSON.parse(transaction.metadata || '{}'),
            callbackData: stkCallback,
          }),
        })
        .where(eq(transactions.id, transaction.id));

      // Update request status to PAID
      await this.db
        .update(requests)
        .set({
          status: RequestStatus.PAID,
          paidAt: new Date(),
        })
        .where(eq(requests.id, transaction.requestId));

      // Get request and student details for notification
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
          // Send payment confirmation notification
          await this.sendPaymentConfirmation(
            student.id,
            student.email,
            student.firstName,
            request.amount,
            mpesaReceiptNumber,
            c.env.DB
          );
        }
      }

      // Audit log
      await auditLog(
        null,
        AuditAction.PAYMENT_COMPLETED,
        'Transaction',
        transaction.id,
        {
          requestId: transaction.requestId,
          amount: transaction.amount,
          mpesaReceiptNumber,
          resultCode,
        },
        c
      );
    } else {
      // Payment failed
      await this.db
        .update(transactions)
        .set({
          status: 'failed',
          failureReason: stkCallback.ResultDesc,
          metadata: JSON.stringify({
            ...JSON.parse(transaction.metadata || '{}'),
            callbackData: stkCallback,
          }),
        })
        .where(eq(transactions.id, transaction.id));

      // Audit log
      await auditLog(
        null,
        AuditAction.PAYMENT_FAILED,
        'Transaction',
        transaction.id,
        {
          requestId: transaction.requestId,
          amount: transaction.amount,
          resultCode,
          failureReason: stkCallback.ResultDesc,
        },
        c
      );
    }
  }

  /**
   * Get payment details by transaction ID
   */
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
      mpesaTransactionId: transaction.mpesaTransactionId,
      mpesaReceiptNumber: transaction.mpesaReceiptNumber,
      phoneNumber: transaction.phoneNumber,
      status: transaction.status,
      initiatedAt: transaction.initiatedAt,
      completedAt: transaction.completedAt,
      failureReason: transaction.failureReason,
    };
  }

  /**
   * Get payment by request ID
   */
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
      mpesaTransactionId: transaction.mpesaTransactionId,
      mpesaReceiptNumber: transaction.mpesaReceiptNumber,
      phoneNumber: transaction.phoneNumber,
      status: transaction.status,
      initiatedAt: transaction.initiatedAt,
      completedAt: transaction.completedAt,
      failureReason: transaction.failureReason,
    };
  }

  /**
   * List all payments (admin only)
   */
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
        mpesaTransactionId: t.mpesaTransactionId,
        mpesaReceiptNumber: t.mpesaReceiptNumber,
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

  /**
   * Send payment confirmation notification
   */
  private async sendPaymentConfirmation(
    userId: string,
    userEmail: string,
    userName: string,
    amount: number,
    mpesaReceipt: string,
    db: D1Database
  ): Promise<void> {
    const subject = 'Payment Confirmed - Bethel Rays of Hope';
    const text = `Dear ${userName},\n\nYour payment has been confirmed!\n\nAmount: KES ${amount.toFixed(2)}\nM-Pesa Receipt: ${mpesaReceipt}\n\nThank you for your patience.\n\nBest regards,\nBethel Rays of Hope`;
    const html = `
      <h2>Payment Confirmed</h2>
      <p>Dear ${userName},</p>
      <p>Your payment has been confirmed!</p>
      <p><strong>Amount:</strong> KES ${amount.toFixed(2)}</p>
      <p><strong>M-Pesa Receipt:</strong> ${mpesaReceipt}</p>
      <p>Thank you for your patience.</p>
      <br>
      <p>Best regards,<br>Bethel Rays of Hope</p>
    `;

    await this.notificationService.queueEmail(db, userId, subject, text, html);

    // Also send SMS notification
    const smsMessage = `Payment confirmed! KES ${amount.toFixed(2)} sent. M-Pesa receipt: ${mpesaReceipt}. Thank you.`;
    await this.notificationService.queueSMS(db, userId, smsMessage);
  }
}

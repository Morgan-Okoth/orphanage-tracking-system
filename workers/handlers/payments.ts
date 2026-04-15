import { Context } from 'hono';
import { PaymentService } from '../services/paymentService';
import { ApiResponse } from '../types';
import { z } from 'zod';
import { initiatePaymentSchema } from '../utils/schemas';

/**
 * Payment handlers
 * Handles payment initiation, callback processing, and payment queries
 */
export const paymentHandlers = {
  /**
   * POST /api/v1/payments/initiate
   * Initiate M-Pesa payment for a verified request
   * Requirements: 7.1, 7.5
   */
  async initiatePayment(c: Context): Promise<Response> {
    try {
      const body = await c.req.json();
      const validated = initiatePaymentSchema.parse(body);

      const user = c.get('user');
      if (!user) {
        return c.json<ApiResponse>({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        }, 401);
      }

      const paymentService = new PaymentService(c.env.DB, c.env);
      const result = await paymentService.initiatePayment(
        validated.requestId,
        validated.phoneNumber,
        user.userId,
        c
      );

      return c.json<ApiResponse>({
        success: true,
        message: 'Payment initiated successfully',
        data: result,
      }, 200);
    } catch (error) {
      console.error('Initiate payment error:', error);

      if (error instanceof z.ZodError) {
        return c.json<ApiResponse>({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        }, 400);
      }

      if (error instanceof Error) {
        if (error.message === 'REQUEST_NOT_FOUND') {
          return c.json<ApiResponse>({
            success: false,
            error: {
              code: 'REQUEST_NOT_FOUND',
              message: 'Request not found',
            },
          }, 404);
        }

        if (error.message === 'REQUEST_NOT_VERIFIED') {
          return c.json<ApiResponse>({
            success: false,
            error: {
              code: 'REQUEST_NOT_VERIFIED',
              message: 'Request must be verified before payment can be initiated',
            },
          }, 400);
        }

        if (error.message === 'PAYMENT_ALREADY_EXISTS') {
          return c.json<ApiResponse>({
            success: false,
            error: {
              code: 'PAYMENT_ALREADY_EXISTS',
              message: 'Payment already exists for this request',
            },
          }, 400);
        }

        if (error.message === 'STUDENT_NOT_FOUND') {
          return c.json<ApiResponse>({
            success: false,
            error: {
              code: 'STUDENT_NOT_FOUND',
              message: 'Student not found',
            },
          }, 404);
        }
      }

      return c.json<ApiResponse>({
        success: false,
        error: {
          code: 'PAYMENT_INITIATION_FAILED',
          message: 'Failed to initiate payment',
        },
      }, 500);
    }
  },

  /**
   * POST /api/v1/payments/webhook
   * Handle M-Pesa callback webhook
   * Requirements: 7.2, 7.3, 7.4, 7.6
   */
  async handleWebhook(c: Context): Promise<Response> {
    try {
      const callbackData = await c.req.json();

      // Validate callback structure
      if (!callbackData.Body || !callbackData.Body.stkCallback) {
        return c.json<ApiResponse>({
          success: false,
          error: {
            code: 'INVALID_CALLBACK',
            message: 'Invalid callback data structure',
          },
        }, 400);
      }

      const paymentService = new PaymentService(c.env.DB, c.env);
      await paymentService.handleCallback(callbackData, c);

      return c.json<ApiResponse>({
        success: true,
        message: 'Callback processed successfully',
      }, 200);
    } catch (error) {
      console.error('Webhook processing error:', error);

      return c.json<ApiResponse>({
        success: false,
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Failed to process webhook',
        },
      }, 500);
    }
  },

  /**
   * GET /api/v1/payments/:id
   * Get payment details by transaction ID
   * Requirements: 7.3
   */
  async getPaymentById(c: Context): Promise<Response> {
    try {
      const transactionId = c.req.param('id');

      if (!transactionId) {
        return c.json<ApiResponse>({
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Transaction ID is required',
          },
        }, 400);
      }

      const paymentService = new PaymentService(c.env.DB, c.env);
      const payment = await paymentService.getPaymentById(transactionId);

      return c.json<ApiResponse>({
        success: true,
        data: payment,
      }, 200);
    } catch (error) {
      console.error('Get payment error:', error);

      if (error instanceof Error && error.message === 'TRANSACTION_NOT_FOUND') {
        return c.json<ApiResponse>({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
          },
        }, 404);
      }

      return c.json<ApiResponse>({
        success: false,
        error: {
          code: 'GET_PAYMENT_FAILED',
          message: 'Failed to retrieve payment details',
        },
      }, 500);
    }
  },

  /**
   * GET /api/v1/payments/request/:requestId
   * Get payment for a specific request
   * Requirements: 7.3
   */
  async getPaymentByRequestId(c: Context): Promise<Response> {
    try {
      const requestId = c.req.param('requestId');

      if (!requestId) {
        return c.json<ApiResponse>({
          success: false,
          error: {
            code: 'INVALID_REQUEST_ID',
            message: 'Request ID is required',
          },
        }, 400);
      }

      const paymentService = new PaymentService(c.env.DB, c.env);
      const payment = await paymentService.getPaymentByRequestId(requestId);

      return c.json<ApiResponse>({
        success: true,
        data: payment,
      }, 200);
    } catch (error) {
      console.error('Get payment by request error:', error);

      if (error instanceof Error && error.message === 'TRANSACTION_NOT_FOUND') {
        return c.json<ApiResponse>({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'No payment found for this request',
          },
        }, 404);
      }

      return c.json<ApiResponse>({
        success: false,
        error: {
          code: 'GET_PAYMENT_FAILED',
          message: 'Failed to retrieve payment details',
        },
      }, 500);
    }
  },

  /**
   * GET /api/v1/payments
   * List all payments (admin only)
   * Requirements: 7.3
   */
  async listPayments(c: Context): Promise<Response> {
    try {
      const page = parseInt(c.req.query('page') || '1', 10);
      const limit = parseInt(c.req.query('limit') || '50', 10);

      if (page < 1 || limit < 1 || limit > 100) {
        return c.json<ApiResponse>({
          success: false,
          error: {
            code: 'INVALID_PAGINATION',
            message: 'Invalid pagination parameters',
          },
        }, 400);
      }

      const paymentService = new PaymentService(c.env.DB, c.env);
      const result = await paymentService.listPayments(page, limit);

      return c.json<ApiResponse>({
        success: true,
        data: result,
      }, 200);
    } catch (error) {
      console.error('List payments error:', error);

      return c.json<ApiResponse>({
        success: false,
        error: {
          code: 'LIST_PAYMENTS_FAILED',
          message: 'Failed to retrieve payments',
        },
      }, 500);
    }
  },
};

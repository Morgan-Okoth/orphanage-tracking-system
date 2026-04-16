/**
 * Donation payment handlers using IntaSend checkout
 * Public donors can donate via M-Pesa, Visa, Mastercard through IntaSend checkout URL
 */

import { Hono } from 'hono';
import { Context } from 'hono';
import type { Env } from '../api/index';
import type { ApiResponse } from '../types';

const app = new Hono<{ Bindings: Env }>();

interface IntaSendConfig {
  publishableKey: string;
  secretKey: string;
  callbackUrl: string;
}

interface IntaSendCollectResponse {
  tracking_id?: string;
  status?: string;
  status_code?: string;
  checkout_url?: string;
  transactions?: Array<{
    transaction_id?: string;
    request_reference_id?: string;
  }>;
  [key: string]: unknown;
}

/**
 * POST /donations/initiate
 * Body: { amount: number, donorName?: string, donorEmail?: string }
 * Returns checkout URL for IntaSend payment
 */
app.post('/initiate', async (c: Context<{ Bindings: Env }>) => {
  try {
    const config: IntaSendConfig = {
      publishableKey: c.env.INTASEND_PUBLISHABLE_KEY,
      secretKey: c.env.INTASEND_SECRET_KEY,
      callbackUrl: c.env.INTASEND_CALLBACK_URL,
    };

    if (!config.secretKey || !config.publishableKey) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'INTASEND_NOT_CONFIGURED', message: 'Payment gateway not configured' },
      }, 500);
    }

    let body: { amount?: number | string; donorName?: string; donorEmail?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' },
      }, 400);
    }

    const amount = Number(body.amount);
    const donorName = body.donorName?.trim() || 'Anonymous';
    const donorEmail = body.donorEmail?.trim();

    if (!amount || amount < 10) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'INVALID_AMOUNT', message: 'Minimum donation amount is KES 10' },
      }, 400);
    }

    if (amount > 1000000) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'INVALID_AMOUNT', message: 'Maximum donation amount is KES 1,000,000' },
      }, 400);
    }

    const donationId = crypto.randomUUID();
    const requestReferenceId = crypto.randomUUID();

    // Create IntaSend collect payment
    const payload = {
      currency: 'KES',
      callback_url: config.callbackUrl,
      transactions: [
        {
          name: donorName,
          amount: Math.round(amount * 100) / 100,
          narrative: 'Donation to Bethel Rays of Hope',
          currency: 'KES',
          country: 'KE',
          request_reference_id: requestReferenceId,
        },
      ],
    };

    const response = await fetch('https://api.intasend.com/api/v1/collect/initiate/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IntaSend API error: ${response.status} - ${errorText}`);
    }

    const intaSendData = (await response.json()) as IntaSendCollectResponse;
    const trackingId = intaSendData.tracking_id || intaSendData.transactions?.[0]?.transaction_id;

    if (!trackingId) {
      throw new Error('INTASEND_TRACKING_ID_MISSING');
    }

    // Store donation record in D1 using raw SQL
    const db = c.env.DB;
    await db.prepare(
      `INSERT INTO donations (id, intasend_tracking_id, request_reference_id, amount, currency, donor_name, donor_email, status, initiated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      donationId,
      trackingId,
      requestReferenceId,
      amount,
      'KES',
      donorName,
      donorEmail || null,
      'pending',
      Date.now(),
      JSON.stringify({ intaSendData })
    ).run();

    const checkoutUrl = intaSendData.checkout_url || `https://payment.intasend.com/payment/${trackingId}`;

    return c.json<ApiResponse>({
      success: true,
      message: 'Donation initiated. Complete payment at the checkout URL.',
      data: {
        donationId,
        trackingId,
        amount,
        checkoutUrl,
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('Donation initiation error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to initiate donation' },
    }, 500);
  }
});

/**
 * POST /donations/webhook
 * Handle IntaSend webhook callbacks for donation payments
 */
app.post('/webhook', async (c: Context<{ Bindings: Env }>) => {
  try {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const trackingId = body.tracking_id as string | undefined;
    if (!trackingId) {
      return c.json({ error: 'Missing tracking_id' }, 400);
    }

    const transactions = body.transactions as Array<{
      status?: string;
      status_code?: string;
      status_description?: string;
      provider_reference?: string;
      amount?: number;
    }> | undefined;
    const transaction = transactions?.[0];
    const statusCode = transaction?.status_code ?? body.status_code;
    const status = transaction?.status ?? body.status;
    const isSuccess =
      statusCode === 'TS100' ||
      String(status).toLowerCase() === 'successful' ||
      String(status).toLowerCase() === 'completed';

    const db = c.env.DB;

    if (isSuccess) {
      await db.prepare(
        `UPDATE donations SET status = ?, completed_at = ?, metadata = ?
         WHERE intasend_tracking_id = ?`
      ).bind(
        'completed',
        Date.now(),
        JSON.stringify({ webhookData: body }),
        trackingId
      ).run();
    } else {
      const failureReason = transaction?.status_description ?? String(status) ?? 'Unknown failure';
      await db.prepare(
        `UPDATE donations SET status = ?, failure_reason = ?, metadata = ?
         WHERE intasend_tracking_id = ?`
      ).bind(
        'failed',
        failureReason,
        JSON.stringify({ webhookData: body }),
        trackingId
      ).run();
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Donation webhook error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;

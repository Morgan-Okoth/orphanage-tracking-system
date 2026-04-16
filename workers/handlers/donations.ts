/**
 * Donation handlers using IntaSend Checkout Link API
 * Generates checkout URLs that users are redirected to for payment
 */

import { Hono } from 'hono';
import { Context } from 'hono';
import type { Env } from '../api/index';
import type { ApiResponse } from '../types';

const app = new Hono<{ Bindings: Env }>();

interface IntaSendCheckoutResponse {
  tracking_id?: string;
  checkout_url?: string;
  status?: string;
  status_code?: string;
  transactions?: Array<{
    transaction_id?: string;
    request_reference_id?: string;
  }>;
  [key: string]: unknown;
}

/**
 * POST /donations/initiate
 * Body: { amount: number, donorName?: string, donorEmail?: string }
 * Returns checkout URL for redirect-based payment
 */
app.post('/initiate', async (c: Context<{ Bindings: Env }>) => {
  try {
    const secretKey = c.env.INTASEND_SECRET_KEY;
    const publishableKey = c.env.INTASEND_PUBLISHABLE_KEY;
    const callbackUrl = c.env.INTASEND_CALLBACK_URL;

    if (!secretKey || !publishableKey) {
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
    const donorName = body.donorName?.trim() || 'Supporter';
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
    const apiRef = `donation-${donationId}`;

    const nameParts = donorName.split(' ');

    // Call IntaSend Checkout Link API
    const payload = {
      public_key: publishableKey,
      amount: Math.round(amount * 100) / 100,
      currency: 'KES',
      email: donorEmail || undefined,
      first_name: nameParts[0] || 'Supporter',
      last_name: nameParts.slice(1).join(' ') || '',
      country: 'KE',
      comment: 'Donation to Bethel Rays of Hope',
      api_ref: apiRef,
      redirect_url: callbackUrl?.replace('/payments/webhook', '/donate') || 'https://orphanage-tracking-frontend.vercel.app/donate',
    };

    const response = await fetch('https://api.intasend.com/api/v1/checkout/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IntaSend API error: ${response.status} - ${errorText}`);
    }

    const intaSendData = (await response.json()) as IntaSendCheckoutResponse;
    const trackingId = intaSendData.tracking_id || intaSendData.transactions?.[0]?.transaction_id;
    const checkoutUrl = intaSendData.checkout_url;

    if (!checkoutUrl) {
      throw new Error('CHECKOUT_URL_MISSING');
    }

    // Store donation record in D1
    const db = c.env.DB;
    await db.prepare(
      `INSERT INTO donations (id, intasend_tracking_id, request_reference_id, amount, currency, donor_name, donor_email, status, initiated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      donationId,
      trackingId || null,
      apiRef,
      amount,
      'KES',
      donorName,
      donorEmail || null,
      'pending',
      Date.now(),
      JSON.stringify({ apiRef, checkoutUrl })
    ).run();

    return c.json<ApiResponse>({
      success: true,
      message: 'Donation initiated. Redirect to checkout URL to complete payment.',
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

    // Handle webhook challenge (IntaSend verification)
    if (body.challenge) {
      const expectedChallenge = c.env.INTASEND_WEBHOOK_CHALLENGE;
      if (expectedChallenge && body.challenge !== expectedChallenge) {
        return c.json({ error: 'Invalid webhook challenge' }, 401);
      }
      return c.json({ success: true });
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
      email?: string;
      name?: string;
    }> | undefined;
    const transaction = transactions?.[0];
    const statusCode = transaction?.status_code ?? body.status_code;
    const status = transaction?.status ?? body.status;
    const isSuccess =
      statusCode === 'TS100' ||
      String(status).toLowerCase() === 'successful' ||
      String(status).toLowerCase() === 'completed';

    const db = c.env.DB;

    // Check if donation record exists for this tracking ID
    const existingDonation = await db.prepare(
      'SELECT id FROM donations WHERE intasend_tracking_id = ?'
    ).bind(trackingId).first();

    if (isSuccess) {
      if (existingDonation) {
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
        // Create new donation record from webhook
        const donationId = crypto.randomUUID();
        const amount = transaction?.amount ?? 0;
        const donorName = transaction?.name ?? 'Anonymous';
        const donorEmail = transaction?.email ?? null;

        await db.prepare(
          `INSERT INTO donations (id, intasend_tracking_id, request_reference_id, amount, currency, donor_name, donor_email, status, initiated_at, completed_at, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          donationId,
          trackingId,
          trackingId,
          amount,
          'KES',
          donorName,
          donorEmail,
          'completed',
          Date.now(),
          Date.now(),
          JSON.stringify({ webhookData: body })
        ).run();
      }
    } else {
      const failureReason = transaction?.status_description ?? String(status) ?? 'Unknown failure';

      if (existingDonation) {
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
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Donation webhook error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;

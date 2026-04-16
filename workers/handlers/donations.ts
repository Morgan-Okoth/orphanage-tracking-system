/**
 * Donation webhook handler
 * Receives IntaSend webhook callbacks when donations are completed
 * The collect payment flow uses IntaSend Inline JS SDK on the frontend
 */

import { Hono } from 'hono';
import { Context } from 'hono';
import type { Env } from '../api/index';
import type { ApiResponse } from '../types';

const app = new Hono<{ Bindings: Env }>();

interface IntaSendWebhookPayload {
  tracking_id?: string;
  status?: string;
  status_code?: string;
  challenge?: string;
  transactions?: Array<{
    transaction_id?: string;
    status?: string;
    status_code?: string;
    status_description?: string;
    provider_reference?: string;
    amount?: number;
    currency?: string;
    email?: string;
    name?: string;
  }>;
  [key: string]: unknown;
}

/**
 * POST /donations/webhook
 * Handle IntaSend webhook callbacks for donation payments
 */
app.post('/webhook', async (c: Context<{ Bindings: Env }>) => {
  try {
    let body: IntaSendWebhookPayload;
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

    const trackingId = body.tracking_id;
    if (!trackingId) {
      return c.json({ error: 'Missing tracking_id' }, 400);
    }

    const transactions = body.transactions;
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
        // Update existing donation
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
        // Create new donation record (for webhook-only scenarios)
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
          transaction?.transaction_id ?? crypto.randomUUID(),
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

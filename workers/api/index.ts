import { Hono } from 'hono';
import { router } from './router';
import { corsMiddleware } from './middleware/cors';
import { securityHeadersMiddleware } from './middleware/securityHeaders';
import { rateLimitMiddleware } from './middleware/rateLimit';
import type { EmailQueueMessage } from '../queues/emailQueue';
import type { SMSQueueMessage } from '../queues/smsQueue';
import emailQueueHandler from '../queues/emailQueue';
import smsQueueHandler from '../queues/smsQueue';
import { BackupService } from '../services/backupService';
import { ArchivalService } from '../services/archivalService';

// Environment bindings interface
export interface Env {
  DB: D1Database;
  DOCUMENTS_BUCKET: R2Bucket;
  BACKUPS_BUCKET: R2Bucket;
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;
  EMAIL_QUEUE: Queue;
  SMS_QUEUE: Queue;
  AI: Ai;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  MPESA_CONSUMER_KEY: string;
  MPESA_CONSUMER_SECRET: string;
  MPESA_SHORTCODE: string;
  MPESA_PASSKEY: string;
  MPESA_CALLBACK_URL: string;
  SENDGRID_API_KEY: string;
  AT_API_KEY: string;
  AT_USERNAME: string;
  AT_SENDER_ID: string;
  ENVIRONMENT: string;
  JWT_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY: string;
}

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// Security headers middleware (applied globally)
app.use('*', securityHeadersMiddleware());

// CORS middleware (applied globally)
app.use('*', corsMiddleware());

// Rate limiting middleware (applied globally, uses KV for tracking)
app.use('*', rateLimitMiddleware());

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    500
  );
});

// Mount router
app.route('/', router);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    },
    404
  );
});

// Export default worker with fetch, queue, and scheduled handlers
export default {
  fetch: app.fetch,

  // Scheduled handler — runs daily at 2:00 AM UTC (cron: "0 2 * * *")
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const backupService = new BackupService();
    try {
      const result = await backupService.performBackup(env);
      console.log(`[BACKUP] Success: ${result.key}, size: ${result.size} bytes, monthly: ${result.isMonthly}`);
    } catch (error) {
      console.error('[BACKUP] Failed:', error);
      // Store failure flag in KV for monitoring — 2-hour TTL matches retry window
      await env.CACHE.put(
        'backup:last_failure',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        { expirationTtl: 7200 }
      );
    }

    // Run archival after backup
    const archivalService = new ArchivalService();
    try {
      const archivalResult = await archivalService.archiveEligibleRequests(env.DB);
      console.log(`[ARCHIVAL] Archived ${archivalResult.archivedCount} requests`);
    } catch (error) {
      console.error('[ARCHIVAL] Failed:', error);
    }
  },

  // Queue handler for email and SMS notifications
  async queue(batch: MessageBatch<EmailQueueMessage | SMSQueueMessage>, env: any): Promise<void> {
    // Determine which queue this is from based on the queue name or message structure
    const firstMessage = batch.messages[0];
    
    if (!firstMessage) {
      console.log('Empty batch received');
      return;
    }

    // Check message structure to determine queue type
    if ('subject' in firstMessage.body && 'html' in firstMessage.body) {
      // Email queue - has subject and html fields
      console.log(`Processing email queue batch with ${batch.messages.length} messages`);
      await emailQueueHandler.queue(batch as MessageBatch<EmailQueueMessage>, env);
    } else if ('message' in firstMessage.body && !('subject' in firstMessage.body)) {
      // SMS queue - has message field but no subject
      console.log(`Processing SMS queue batch with ${batch.messages.length} messages`);
      await smsQueueHandler.queue(batch as MessageBatch<SMSQueueMessage>, env);
    } else {
      console.error('Unknown queue message format:', firstMessage.body);
      // Acknowledge unknown messages to prevent infinite retries
      for (const message of batch.messages) {
        message.ack();
      }
    }
  },
};

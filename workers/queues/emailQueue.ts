/**
 * Email Queue Consumer Worker
 * Processes email notifications from Cloudflare Queue
 */

import { getDb } from '../db/client';
import { notifications } from '../db/schema';
import { eq } from 'drizzle-orm';
import { MAX_NOTIFICATION_RETRIES } from '../utils/constants';

export interface EmailQueueMessage {
  notificationId: string;
  userId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send email via Resend API
 */
async function sendEmailViaResend(
  message: EmailQueueMessage,
  apiKey: string
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Bethel Rays of Hope <noreply@bethelraysofhope.org>',
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${response.status} - ${error}`);
  }
}

/**
 * Send batch emails via Resend API
 */
async function sendBatchEmailsViaResend(
  messages: EmailQueueMessage[],
  apiKey: string
): Promise<{ success: EmailQueueMessage[]; failed: { message: EmailQueueMessage; error: string }[] }> {
  const success: EmailQueueMessage[] = [];
  const failed: { message: EmailQueueMessage; error: string }[] = [];

  for (const message of messages) {
    try {
      await sendEmailViaResend(message, apiKey);
      success.push(message);
    } catch (error) {
      failed.push({
        message,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { success, failed };
}

/**
 * Update notification status in database
 */
async function updateNotificationStatus(
  db: D1Database,
  notificationId: string,
  status: 'sent' | 'failed',
  errorMessage?: string,
  incrementRetry: boolean = false
): Promise<void> {
  const dbClient = getDb(db);

  if (status === 'sent') {
    await dbClient
      .update(notifications)
      .set({
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(notifications.id, notificationId));
  } else {
    const updateData: any = {
      status: 'failed',
      failureReason: errorMessage,
    };

    if (incrementRetry) {
      // Get current retry count and increment
      const notification = await dbClient
        .select({ retryCount: notifications.retryCount })
        .from(notifications)
        .where(eq(notifications.id, notificationId))
        .get();

      updateData.retryCount = (notification?.retryCount || 0) + 1;
    }

    await dbClient
      .update(notifications)
      .set(updateData)
      .where(eq(notifications.id, notificationId));
  }
}

/**
 * Email Queue Consumer
 * Processes messages from the email-notifications queue
 */
export default {
  async queue(
    batch: MessageBatch<EmailQueueMessage>,
    env: any // Using any to avoid Env type issues
  ): Promise<void> {
    const db = env.DB;
    
    console.log(`Processing email batch with ${batch.messages.length} messages`);

    // Process messages in smaller batches for better error handling
    const BATCH_SIZE = 5;
    const messageBatches: EmailQueueMessage[][] = [];
    
    for (let i = 0; i < batch.messages.length; i += BATCH_SIZE) {
      messageBatches.push(batch.messages.slice(i, i + BATCH_SIZE).map(m => m.body));
    }

    for (const messageBatch of messageBatches) {
      try {
        // Send batch of emails
        const { success, failed } = await sendBatchEmailsViaResend(
          messageBatch,
          env.RESEND_API_KEY
        );

        // Update successful notifications
        for (const successMessage of success) {
          await updateNotificationStatus(db, successMessage.notificationId, 'sent');
        }

        // Handle failed notifications
        for (const { message: failedMessage, error } of failed) {
          console.error(`Email send failed for notification ${failedMessage.notificationId}:`, error);

          // Get current notification to check retry count
          const dbClient = getDb(db);
          const notification = await dbClient
            .select({ retryCount: notifications.retryCount })
            .from(notifications)
            .where(eq(notifications.id, failedMessage.notificationId))
            .get();

          const currentRetryCount = notification?.retryCount || 0;
          const newRetryCount = currentRetryCount + 1;

          if (newRetryCount >= MAX_NOTIFICATION_RETRIES) {
            // Max retries reached, mark as permanently failed
            await updateNotificationStatus(
              db,
              failedMessage.notificationId,
              'failed',
              `Max retries exceeded: ${error}`
            );
          } else {
            // Increment retry count for future retry
            await updateNotificationStatus(
              db,
              failedMessage.notificationId,
              'failed',
              error,
              true
            );
          }
        }

        // Acknowledge all messages in this batch
        const batchStartIndex = messageBatches.indexOf(messageBatch) * BATCH_SIZE;
        for (let i = 0; i < messageBatch.length; i++) {
          const messageIndex = batchStartIndex + i;
          if (messageIndex < batch.messages.length) {
            const originalMessage = batch.messages[messageIndex];
            
            // Check if we should retry this message
            const failedItem = failed.find(f => f.message.notificationId === messageBatch[i].notificationId);
            if (failedItem) {
              const dbClient = getDb(db);
              const notification = await dbClient
                .select({ retryCount: notifications.retryCount })
                .from(notifications)
                .where(eq(notifications.id, messageBatch[i].notificationId))
                .get();

              if ((notification?.retryCount || 0) < MAX_NOTIFICATION_RETRIES) {
                // Retry the message
                originalMessage.retry();
                continue;
              }
            }
            
            // Acknowledge the message (either success or max retries reached)
            originalMessage.ack();
          }
        }

      } catch (batchError) {
        console.error('Batch processing error:', batchError);
        
        // Handle batch-level errors by retrying individual messages
        const batchStartIndex = messageBatches.indexOf(messageBatch) * BATCH_SIZE;
        for (let i = 0; i < messageBatch.length; i++) {
          const messageIndex = batchStartIndex + i;
          if (messageIndex < batch.messages.length) {
            const originalMessage = batch.messages[messageIndex];
            
            // Update notification with batch error
            await updateNotificationStatus(
              db,
              messageBatch[i].notificationId,
              'failed',
              `Batch error: ${batchError instanceof Error ? batchError.message : 'Unknown batch error'}`,
              true
            );
            
            // Retry or acknowledge based on retry count
            const dbClient = getDb(db);
            const notification = await dbClient
              .select({ retryCount: notifications.retryCount })
              .from(notifications)
              .where(eq(notifications.id, messageBatch[i].notificationId))
              .get();

            if ((notification?.retryCount || 0) < MAX_NOTIFICATION_RETRIES) {
              originalMessage.retry();
            } else {
              originalMessage.ack();
            }
          }
        }
      }
    }

    console.log(`Completed processing email batch`);
  },
};

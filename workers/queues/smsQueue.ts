/**
 * SMS Queue Consumer Worker
 * Processes SMS notifications from Cloudflare Queue
 */

import { getDb } from '../db/client';
import { notifications } from '../db/schema';
import { eq } from 'drizzle-orm';
import { MAX_NOTIFICATION_RETRIES } from '../utils/constants';

export interface SMSQueueMessage {
  notificationId: string;
  userId: string;
  to: string;
  message: string;
}

/**
 * Send SMS via Africa's Talking API
 */
async function sendSMSViaAfricasTalking(
  message: SMSQueueMessage,
  apiKey: string,
  username: string,
  senderId: string = 'BETHEL'
): Promise<any> {
  const response = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      apiKey: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      username: username,
      to: message.to,
      message: message.message,
      from: senderId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Africa's Talking API error: ${response.status} - ${error}`);
  }

  const result = await response.json() as any;
  
  // Check if the SMS was accepted by Africa's Talking
  if (result.SMSMessageData && result.SMSMessageData.Recipients) {
    const recipient = result.SMSMessageData.Recipients[0];
    if (recipient && recipient.statusCode !== 101) {
      throw new Error(`SMS delivery failed: ${recipient.status || 'Unknown error'}`);
    }
  }

  return result;
}

/**
 * Send batch SMS via Africa's Talking API
 */
async function sendBatchSMSViaAfricasTalking(
  messages: SMSQueueMessage[],
  apiKey: string,
  username: string,
  senderId: string = 'BETHEL'
): Promise<{ success: { message: SMSQueueMessage; result: any }[]; failed: { message: SMSQueueMessage; error: string }[] }> {
  const success: { message: SMSQueueMessage; result: any }[] = [];
  const failed: { message: SMSQueueMessage; error: string }[] = [];

  // Process messages individually for better error handling
  // Africa's Talking supports bulk SMS, but individual processing gives better error granularity
  for (const message of messages) {
    try {
      const result = await sendSMSViaAfricasTalking(message, apiKey, username, senderId);
      success.push({ message, result });
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
  metadata?: any,
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
        metadata: metadata ? JSON.stringify(metadata) : null,
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
 * SMS Queue Consumer
 * Processes messages from the sms-notifications queue
 */
export default {
  async queue(
    batch: MessageBatch<SMSQueueMessage>,
    env: any // Using any to avoid Env type issues
  ): Promise<void> {
    const db = env.DB;
    
    console.log(`Processing SMS batch with ${batch.messages.length} messages`);

    // Process messages in smaller batches for better error handling
    const BATCH_SIZE = 10; // SMS can handle larger batches than email
    const messageBatches: SMSQueueMessage[][] = [];
    
    for (let i = 0; i < batch.messages.length; i += BATCH_SIZE) {
      messageBatches.push(batch.messages.slice(i, i + BATCH_SIZE).map(m => m.body));
    }

    for (const messageBatch of messageBatches) {
      try {
        // Send batch of SMS
        const { success, failed } = await sendBatchSMSViaAfricasTalking(
          messageBatch,
          env.AT_API_KEY,
          env.AT_USERNAME,
          env.AT_SENDER_ID || 'BETHEL'
        );

        // Update successful notifications
        for (const { message: successMessage, result } of success) {
          await updateNotificationStatus(
            db,
            successMessage.notificationId,
            'sent',
            result
          );
        }

        // Handle failed notifications
        for (const { message: failedMessage, error } of failed) {
          console.error(`SMS send failed for notification ${failedMessage.notificationId}:`, error);

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
              null,
              `Max retries exceeded: ${error}`
            );
          } else {
            // Increment retry count for future retry
            await updateNotificationStatus(
              db,
              failedMessage.notificationId,
              'failed',
              null,
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
        console.error('SMS batch processing error:', batchError);
        
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
              null,
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

    console.log(`Completed processing SMS batch`);
  },
};

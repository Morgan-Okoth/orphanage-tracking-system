/**
 * Queue Service
 * Centralized service for managing Cloudflare Queue operations
 */

import type { EmailQueueMessage } from '../queues/emailQueue';
import type { SMSQueueMessage } from '../queues/smsQueue';

export interface QueueProducerOptions {
  delay?: number; // Delay in seconds before processing
  retryCount?: number; // Number of retries for this specific message
}

export class QueueService {
  private emailQueue: Queue<EmailQueueMessage>;
  private smsQueue: Queue<SMSQueueMessage>;

  constructor(emailQueue: Queue<EmailQueueMessage>, smsQueue: Queue<SMSQueueMessage>) {
    this.emailQueue = emailQueue;
    this.smsQueue = smsQueue;
  }

  /**
   * Send email message to queue
   */
  async sendEmailToQueue(
    message: EmailQueueMessage,
    options?: QueueProducerOptions
  ): Promise<void> {
    try {
      await this.emailQueue.send(message, {
        delaySeconds: options?.delay,
      });
      
      console.log(`Email queued for notification ${message.notificationId}`);
    } catch (error) {
      console.error(`Failed to queue email for notification ${message.notificationId}:`, error);
      throw new Error(`Queue send failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send SMS message to queue
   */
  async sendSMSToQueue(
    message: SMSQueueMessage,
    options?: QueueProducerOptions
  ): Promise<void> {
    try {
      await this.smsQueue.send(message, {
        delaySeconds: options?.delay,
      });
      
      console.log(`SMS queued for notification ${message.notificationId}`);
    } catch (error) {
      console.error(`Failed to queue SMS for notification ${message.notificationId}:`, error);
      throw new Error(`Queue send failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send batch of email messages to queue
   */
  async sendEmailBatchToQueue(
    messages: EmailQueueMessage[],
    options?: QueueProducerOptions
  ): Promise<void> {
    try {
      // Send messages individually with optional delay
      const promises = messages.map(message => 
        this.emailQueue.send(message, {
          delaySeconds: options?.delay,
        })
      );

      await Promise.all(promises);
      
      console.log(`Email batch of ${messages.length} messages queued`);
    } catch (error) {
      console.error(`Failed to queue email batch:`, error);
      throw new Error(`Batch queue send failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send batch of SMS messages to queue
   */
  async sendSMSBatchToQueue(
    messages: SMSQueueMessage[],
    options?: QueueProducerOptions
  ): Promise<void> {
    try {
      // Send messages individually with optional delay
      const promises = messages.map(message => 
        this.smsQueue.send(message, {
          delaySeconds: options?.delay,
        })
      );

      await Promise.all(promises);
      
      console.log(`SMS batch of ${messages.length} messages queued`);
    } catch (error) {
      console.error(`Failed to queue SMS batch:`, error);
      throw new Error(`Batch queue send failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send delayed notification (useful for reminders or follow-ups)
   */
  async sendDelayedEmailNotification(
    message: EmailQueueMessage,
    delayMinutes: number
  ): Promise<void> {
    const delaySeconds = delayMinutes * 60;
    await this.sendEmailToQueue(message, { delay: delaySeconds });
    
    console.log(`Delayed email notification scheduled for ${delayMinutes} minutes from now`);
  }

  /**
   * Send delayed SMS notification
   */
  async sendDelayedSMSNotification(
    message: SMSQueueMessage,
    delayMinutes: number
  ): Promise<void> {
    const delaySeconds = delayMinutes * 60;
    await this.sendSMSToQueue(message, { delay: delaySeconds });
    
    console.log(`Delayed SMS notification scheduled for ${delayMinutes} minutes from now`);
  }

  /**
   * Health check for queues
   */
  async healthCheck(): Promise<{ email: boolean; sms: boolean }> {
    const results = { email: false, sms: false };

    try {
      // Test email queue by sending a test message (this would be consumed but not processed)
      const testEmailMessage: EmailQueueMessage = {
        notificationId: 'health-check-email',
        userId: 'health-check',
        to: 'health-check@test.com',
        subject: 'Health Check',
        text: 'Health check message',
      };

      await this.emailQueue.send(testEmailMessage);
      results.email = true;
    } catch (error) {
      console.error('Email queue health check failed:', error);
    }

    try {
      // Test SMS queue by sending a test message
      const testSMSMessage: SMSQueueMessage = {
        notificationId: 'health-check-sms',
        userId: 'health-check',
        to: '+254700000000',
        message: 'Health check message',
      };

      await this.smsQueue.send(testSMSMessage);
      results.sms = true;
    } catch (error) {
      console.error('SMS queue health check failed:', error);
    }

    return results;
  }
}

/**
 * Factory function to create QueueService instance
 */
export function createQueueService(
  emailQueue: Queue<EmailQueueMessage>,
  smsQueue: Queue<SMSQueueMessage>
): QueueService {
  return new QueueService(emailQueue, smsQueue);
}
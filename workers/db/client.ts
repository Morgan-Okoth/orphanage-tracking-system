import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Env = {
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
  ENVIRONMENT: string;
  JWT_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY: string;
};

export function getDb(db: D1Database) {
  return drizzle(db, { schema });
}

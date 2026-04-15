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
  INTASEND_SECRET_KEY: string;
  INTASEND_CALLBACK_URL: string;
  INTASEND_WEBHOOK_CHALLENGE?: string;
  INTASEND_DEVICE_ID?: string;
  RESEND_API_KEY: string;
  AT_API_KEY: string;
  AT_USERNAME: string;
  ENVIRONMENT: string;
  JWT_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY: string;
};

export function getDb(db: D1Database) {
  return drizzle(db, { schema });
}

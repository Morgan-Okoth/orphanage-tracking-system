/**
 * BackupService — Daily D1 database backups to R2 with AES-256-GCM encryption.
 *
 * Requirements: 18.1, 18.2, 18.3
 *
 * Schedule: 2:00 AM UTC daily (cron: "0 2 * * *")
 * Retention: 30 days (daily), 365 days / 12 months (monthly)
 * Storage: BACKUPS_BUCKET (R2)
 * Encryption: AES-256-GCM via utils/encryption
 */

import { encrypt, decrypt } from '../utils/encryption';
import type { Env } from '../api/index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupResult {
  success: boolean;
  key: string;
  size: number;
  isMonthly: boolean;
  timestamp: string;
}

export interface BackupEntry {
  key: string;
  size: number;
  uploaded: Date;
  label: string; // YYYY-MM-DD or YYYY-MM
}

export interface BackupListResult {
  daily: BackupEntry[];
  monthly: BackupEntry[];
}

export interface BackupVerifyResult {
  valid: boolean;
  recordCount: number;
  tables: Record<string, number>; // tableName -> row count
}

export interface BackupPayload {
  version: string;
  timestamp: string;
  tables: Record<string, unknown[]>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABLES = [
  'users',
  'requests',
  'documents',
  'transactions',
  'audit_logs',
  'notifications',
  'comments',
  'status_changes',
  'document_access',
  'public_statistics',
] as const;

const DAILY_RETENTION_DAYS = 30;
const MONTHLY_RETENTION_DAYS = 365;

// ─── BackupService ────────────────────────────────────────────────────────────

export class BackupService {
  /**
   * Main backup orchestration.
   * - Exports all D1 tables to JSON
   * - Encrypts with AES-256-GCM
   * - Stores in BACKUPS_BUCKET
   * - Creates monthly backup on 1st of month
   * - Enforces retention policy
   * - Logs success/failure to CACHE KV
   */
  async performBackup(env: Env): Promise<BackupResult> {
    const now = new Date();
    const dateStr = this.formatDate(now);       // YYYY-MM-DD
    const monthStr = this.formatMonth(now);     // YYYY-MM
    const isMonthly = now.getUTCDate() === 1;

    // 1. Export all tables
    const tables: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      try {
        const result = await env.DB.prepare(`SELECT * FROM ${table}`).all();
        tables[table] = result.results ?? [];
      } catch {
        // Table may not exist yet — store empty array
        tables[table] = [];
      }
    }

    // 2. Build payload
    const payload: BackupPayload = {
      version: '1.0',
      timestamp: now.toISOString(),
      tables,
    };
    const plaintext = JSON.stringify(payload);

    // 3. Encrypt
    const encrypted = await encrypt(plaintext, env.ENCRYPTION_KEY);
    const encryptedBytes = new TextEncoder().encode(encrypted);
    const size = encryptedBytes.byteLength;

    // 4. Store daily backup
    const dailyKey = `backups/daily/${dateStr}.json.enc`;
    await env.BACKUPS_BUCKET.put(dailyKey, encryptedBytes);

    // 5. Store monthly backup on 1st of month
    if (isMonthly) {
      const monthlyKey = `backups/monthly/${monthStr}.json.enc`;
      await env.BACKUPS_BUCKET.put(monthlyKey, encryptedBytes);
    }

    // 6. Enforce retention policy
    await this.deleteOldBackups(env);

    // 7. Log success to KV
    const successMeta = { timestamp: now.toISOString(), size, key: dailyKey };
    await env.CACHE.put('backup:last_success', JSON.stringify(successMeta));

    return { success: true, key: dailyKey, size, isMonthly, timestamp: now.toISOString() };
  }

  /**
   * Download and decrypt a backup to verify integrity.
   */
  async verifyBackup(env: Env, key: string): Promise<BackupVerifyResult> {
    const object = await env.BACKUPS_BUCKET.get(key);
    if (!object) {
      return { valid: false, recordCount: 0, tables: {} };
    }

    const encryptedText = await object.text();
    let payload: BackupPayload;

    try {
      const decrypted = await decrypt(encryptedText, env.ENCRYPTION_KEY);
      payload = JSON.parse(decrypted) as BackupPayload;
    } catch {
      return { valid: false, recordCount: 0, tables: {} };
    }

    if (!payload.version || !payload.timestamp || !payload.tables) {
      return { valid: false, recordCount: 0, tables: {} };
    }

    const tables: Record<string, number> = {};
    let recordCount = 0;
    for (const [tableName, rows] of Object.entries(payload.tables)) {
      const count = Array.isArray(rows) ? rows.length : 0;
      tables[tableName] = count;
      recordCount += count;
    }

    return { valid: true, recordCount, tables };
  }

  /**
   * List all backups in R2, categorized as daily or monthly.
   */
  async listBackups(env: Env): Promise<BackupListResult> {
    const [dailyList, monthlyList] = await Promise.all([
      env.BACKUPS_BUCKET.list({ prefix: 'backups/daily/' }),
      env.BACKUPS_BUCKET.list({ prefix: 'backups/monthly/' }),
    ]);

    const toEntry = (obj: R2Object): BackupEntry => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      label: this.labelFromKey(obj.key),
    });

    return {
      daily: dailyList.objects.map(toEntry),
      monthly: monthlyList.objects.map(toEntry),
    };
  }

  /**
   * Delete backups older than retention thresholds.
   * - Daily: older than 30 days
   * - Monthly: older than 365 days
   */
  async deleteOldBackups(env: Env): Promise<void> {
    const now = new Date();

    const dailyCutoff = new Date(now);
    dailyCutoff.setUTCDate(dailyCutoff.getUTCDate() - DAILY_RETENTION_DAYS);

    const monthlyCutoff = new Date(now);
    monthlyCutoff.setUTCDate(monthlyCutoff.getUTCDate() - MONTHLY_RETENTION_DAYS);

    const [dailyList, monthlyList] = await Promise.all([
      env.BACKUPS_BUCKET.list({ prefix: 'backups/daily/' }),
      env.BACKUPS_BUCKET.list({ prefix: 'backups/monthly/' }),
    ]);

    const deletePromises: Promise<void>[] = [];

    for (const obj of dailyList.objects) {
      if (obj.uploaded < dailyCutoff) {
        deletePromises.push(env.BACKUPS_BUCKET.delete(obj.key));
      }
    }

    for (const obj of monthlyList.objects) {
      if (obj.uploaded < monthlyCutoff) {
        deletePromises.push(env.BACKUPS_BUCKET.delete(obj.key));
      }
    }

    await Promise.all(deletePromises);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private formatDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatMonth(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private labelFromKey(key: string): string {
    // backups/daily/2024-01-15.json.enc -> 2024-01-15
    // backups/monthly/2024-01.json.enc  -> 2024-01
    const parts = key.split('/');
    const filename = parts[parts.length - 1] ?? key;
    return filename.replace('.json.enc', '');
  }
}

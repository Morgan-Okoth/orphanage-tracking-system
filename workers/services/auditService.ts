import { Context } from 'hono';
import { auditLogs } from '../db/schema';
import { AuditAction } from '../types';
import { getDb } from '../db/client';

/**
 * Log an audit event
 * Creates an immutable audit log entry for accountability
 */
export async function auditLog(
  userId: string | null,
  action: AuditAction,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, any>,
  c: Context
): Promise<void> {
  try {
    const db = getDb(c.env.DB);

    // Get IP address and user agent from request
    const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    // Create audit log entry
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId,
      action,
      resourceType,
      resourceId,
      metadata: JSON.stringify(metadata),
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main flow
    console.error('Audit logging failed:', error);
  }
}

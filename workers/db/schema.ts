import { sqliteTable, text, integer, real, SQLiteColumn, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['STUDENT', 'ADMIN_LEVEL_1', 'ADMIN_LEVEL_2', 'SUPERADMIN'] }).notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  accountStatus: text('account_status', { 
    enum: ['PENDING', 'ACTIVE', 'DEACTIVATED', 'REJECTED'] 
  }).default('PENDING').notNull(),
  isEmailVerified: integer('is_email_verified', { mode: 'boolean' }).default(false).notNull(),
  isPhoneVerified: integer('is_phone_verified', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  approvedById: text('approved_by_id').references((): SQLiteColumn => users.id),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  phoneIdx: index('users_phone_idx').on(table.phone),
  accountStatusIdx: index('users_account_status_idx').on(table.accountStatus),
}));

// Requests table
export const requests = sqliteTable('requests', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references((): SQLiteColumn => users.id),
  type: text('type', { 
    enum: ['SCHOOL_FEES', 'MEDICAL_EXPENSES', 'SUPPLIES', 'EMERGENCY', 'OTHER'] 
  }).notNull(),
  amount: real('amount').notNull(),
  reason: text('reason').notNull(),
  status: text('status', {
    enum: ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_DOCUMENTS', 'APPROVED', 
           'VERIFIED', 'PAID', 'DISPUTED', 'RESOLVED', 'REJECTED', 'FLAGGED', 'ARCHIVED']
  }).default('SUBMITTED').notNull(),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  paidAt: integer('paid_at', { mode: 'timestamp' }),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  rejectionReason: text('rejection_reason'),
  flagReason: text('flag_reason'),
  disputeReason: text('dispute_reason'),
  disputeRaisedAt: integer('dispute_raised_at', { mode: 'timestamp' }),
  disputeResolvedAt: integer('dispute_resolved_at', { mode: 'timestamp' }),
  disputeResolution: text('dispute_resolution'),
}, (table) => ({
  studentIdIdx: index('requests_student_id_idx').on(table.studentId),
  statusIdx: index('requests_status_idx').on(table.status),
  submittedAtIdx: index('requests_submitted_at_idx').on(table.submittedAt),
}));

// Documents table
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references((): SQLiteColumn => requests.id),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  r2Key: text('r2_key').notNull().unique(),
  r2Bucket: text('r2_bucket').notNull(),
  version: integer('version').default(1).notNull(),
  uploadedById: text('uploaded_by_id').notNull().references((): SQLiteColumn => users.id),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false).notNull(),
  scanStatus: text('scan_status').default('pending').notNull(),
}, (table) => ({
  requestIdIdx: index('documents_request_id_idx').on(table.requestId),
}));

// Document access logs
export const documentAccess = sqliteTable('document_access', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references((): SQLiteColumn => documents.id),
  userId: text('user_id').notNull(),
  accessedAt: integer('accessed_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  ipAddress: text('ip_address').notNull(),
});

// Comments table
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references((): SQLiteColumn => requests.id),
  authorId: text('author_id').notNull().references((): SQLiteColumn => users.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  isInternal: integer('is_internal', { mode: 'boolean' }).default(false).notNull(),
});

// Status changes table
export const statusChanges = sqliteTable('status_changes', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references((): SQLiteColumn => requests.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedById: text('changed_by_id').notNull(),
  changedAt: integer('changed_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  reason: text('reason'),
});

// Transactions table
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().unique().references((): SQLiteColumn => requests.id),
  amount: real('amount').notNull(),
  currency: text('currency').default('KES').notNull(),
  mpesaTransactionId: text('mpesa_transaction_id').unique(),
  mpesaReceiptNumber: text('mpesa_receipt_number'),
  phoneNumber: text('phone_number').notNull(),
  status: text('status').notNull(),
  initiatedAt: integer('initiated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  failureReason: text('failure_reason'),
  metadata: text('metadata'), // JSON string
});

// Audit logs table
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references((): SQLiteColumn => users.id),
  action: text('action', {
    enum: ['USER_LOGIN', 'USER_LOGIN_FAILED', 'USER_LOGOUT', 'USER_CREATED', 
           'USER_APPROVED', 'USER_REJECTED', 'USER_DEACTIVATED', 'USER_REACTIVATED',
           'USER_UPDATED', 'REQUEST_CREATED', 'REQUEST_STATUS_CHANGED', 
           'DOCUMENT_UPLOADED', 'DOCUMENT_ACCESSED', 'PAYMENT_INITIATED', 
           'PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'DISPUTE_RAISED', 'DISPUTE_RESOLVED',
           'COMMENT_ADDED', 'REPORT_GENERATED']
  }).notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: text('metadata'), // JSON string
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  timestampIdx: index('audit_logs_timestamp_idx').on(table.timestamp),
}));

// Notifications table
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references((): SQLiteColumn => users.id),
  type: text('type').notNull(),
  channel: text('channel').notNull(),
  subject: text('subject'),
  message: text('message').notNull(),
  status: text('status').default('pending').notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  failureReason: text('failure_reason'),
  retryCount: integer('retry_count').default(0).notNull(),
  metadata: text('metadata'), // JSON string
  readAt: integer('read_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Public statistics table
export const publicStatistics = sqliteTable('public_statistics', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(), // ISO date string
  totalReceived: real('total_received').notNull(),
  totalDisbursed: real('total_disbursed').notNull(),
  requestsApproved: integer('requests_approved').notNull(),
  requestsRejected: integer('requests_rejected').notNull(),
  requestsByType: text('requests_by_type').notNull(), // JSON string
  amountsByType: text('amounts_by_type').notNull(), // JSON string
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

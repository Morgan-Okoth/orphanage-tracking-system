-- Migration: 0001_initial_schema
-- Description: Create all tables for the Financial Transparency and Accountability System
-- Created: 2024-01-15

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'ADMIN_LEVEL_1', 'ADMIN_LEVEL_2', 'SUPERADMIN')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (account_status IN ('PENDING', 'ACTIVE', 'DEACTIVATED', 'REJECTED')),
  is_email_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_email_verified IN (0, 1)),
  is_phone_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_phone_verified IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_login_at INTEGER,
  approved_by_id TEXT REFERENCES users(id)
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);
CREATE INDEX IF NOT EXISTS users_account_status_idx ON users(account_status);

-- Requests table
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('SCHOOL_FEES', 'MEDICAL_EXPENSES', 'SUPPLIES', 'EMERGENCY', 'OTHER')),
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'PENDING_DOCUMENTS', 'APPROVED', 'VERIFIED', 'PAID', 'REJECTED', 'FLAGGED', 'ARCHIVED')),
  submitted_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  reviewed_at INTEGER,
  verified_at INTEGER,
  paid_at INTEGER,
  archived_at INTEGER,
  rejection_reason TEXT,
  flag_reason TEXT
);

-- Indexes for requests table
CREATE INDEX IF NOT EXISTS requests_student_id_idx ON requests(student_id);
CREATE INDEX IF NOT EXISTS requests_status_idx ON requests(status);
CREATE INDEX IF NOT EXISTS requests_submitted_at_idx ON requests(submitted_at);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  r2_bucket TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by_id TEXT NOT NULL REFERENCES users(id),
  uploaded_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  scan_status TEXT NOT NULL DEFAULT 'pending'
);

-- Indexes for documents table
CREATE INDEX IF NOT EXISTS documents_request_id_idx ON documents(request_id);

-- Document access logs table
CREATE TABLE IF NOT EXISTS document_access (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  user_id TEXT NOT NULL,
  accessed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  ip_address TEXT NOT NULL
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  is_internal INTEGER NOT NULL DEFAULT 0 CHECK (is_internal IN (0, 1))
);

-- Status changes table
CREATE TABLE IF NOT EXISTS status_changes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_id TEXT NOT NULL,
  changed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  reason TEXT
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES requests(id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  mpesa_transaction_id TEXT UNIQUE,
  mpesa_receipt_number TEXT,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL,
  initiated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  completed_at INTEGER,
  failure_reason TEXT,
  metadata TEXT
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('USER_LOGIN', 'USER_LOGIN_FAILED', 'USER_LOGOUT', 'USER_CREATED', 'USER_APPROVED', 'USER_DEACTIVATED', 'REQUEST_CREATED', 'REQUEST_STATUS_CHANGED', 'DOCUMENT_UPLOADED', 'DOCUMENT_ACCESSED', 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'COMMENT_ADDED', 'REPORT_GENERATED')),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Indexes for audit_logs table
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at INTEGER,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Public statistics table
CREATE TABLE IF NOT EXISTS public_statistics (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  total_received REAL NOT NULL,
  total_disbursed REAL NOT NULL,
  requests_approved INTEGER NOT NULL,
  requests_rejected INTEGER NOT NULL,
  requests_by_type TEXT NOT NULL,
  amounts_by_type TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

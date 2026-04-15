-- Migration: 0003_add_superadmin_role
-- Description: Expand the users.role constraint to support SUPERADMIN accounts
-- Created: 2026-04-15

PRAGMA foreign_keys=OFF;

CREATE TABLE users_new (
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

INSERT INTO users_new (
  id,
  email,
  phone,
  password_hash,
  role,
  first_name,
  last_name,
  account_status,
  is_email_verified,
  is_phone_verified,
  created_at,
  updated_at,
  last_login_at,
  approved_by_id
)
SELECT
  id,
  email,
  phone,
  password_hash,
  role,
  first_name,
  last_name,
  account_status,
  is_email_verified,
  is_phone_verified,
  created_at,
  updated_at,
  last_login_at,
  approved_by_id
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);
CREATE INDEX IF NOT EXISTS users_account_status_idx ON users(account_status);

PRAGMA foreign_keys=ON;

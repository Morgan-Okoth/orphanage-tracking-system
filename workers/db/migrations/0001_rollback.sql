-- Rollback Migration: 0001_initial_schema
-- Description: Drop all tables created in the initial schema migration
-- WARNING: This will delete all data in the database

-- Drop tables in reverse order of dependencies to avoid foreign key constraint errors

DROP TABLE IF EXISTS public_statistics;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS status_changes;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS document_access;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS users;

-- Drop indexes (if they weren't automatically dropped with tables)
DROP INDEX IF EXISTS users_email_idx;
DROP INDEX IF EXISTS users_phone_idx;
DROP INDEX IF EXISTS users_account_status_idx;
DROP INDEX IF EXISTS requests_student_id_idx;
DROP INDEX IF EXISTS requests_status_idx;
DROP INDEX IF EXISTS requests_submitted_at_idx;
DROP INDEX IF EXISTS documents_request_id_idx;
DROP INDEX IF EXISTS audit_logs_timestamp_idx;

-- Verification: List remaining tables (should be empty)
SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';

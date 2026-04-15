-- Seed Data Script for Development Environment
-- Description: Populate database with test data for development and testing
-- WARNING: This script should ONLY be run in development environments

-- Clear existing data (in reverse order of dependencies)
DELETE FROM public_statistics;
DELETE FROM notifications;
DELETE FROM audit_logs;
DELETE FROM transactions;
DELETE FROM status_changes;
DELETE FROM comments;
DELETE FROM document_access;
DELETE FROM documents;
DELETE FROM requests;
DELETE FROM users;

-- Insert test users
-- Password for all users: TestPass123! (hashed with bcrypt, 12 rounds)
-- Hash: $2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu

-- Superadmin
INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, account_status, is_email_verified, is_phone_verified, created_at, updated_at)
VALUES
  ('superadmin-001', 'superadmin@bethelraysofhope.org', '+254700000000', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'SUPERADMIN', 'Bethel', 'Governance', 'ACTIVE', 1, 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- Admin Level 2 (Auditor)
INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, account_status, is_email_verified, is_phone_verified, created_at, updated_at)
VALUES 
  ('admin2-001', 'auditor@bethelraysofhope.org', '+254700000001', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'ADMIN_LEVEL_2', 'Sarah', 'Kimani', 'ACTIVE', 1, 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- Admin Level 1 (Operations)
INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, account_status, is_email_verified, is_phone_verified, created_at, updated_at, approved_by_id)
VALUES 
  ('admin1-001', 'operations@bethelraysofhope.org', '+254700000002', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'ADMIN_LEVEL_1', 'John', 'Mwangi', 'ACTIVE', 1, 1, strftime('%s', 'now'), strftime('%s', 'now'), 'superadmin-001'),
  ('admin1-002', 'admin@bethelraysofhope.org', '+254700000003', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'ADMIN_LEVEL_1', 'Grace', 'Wanjiru', 'ACTIVE', 1, 1, strftime('%s', 'now'), strftime('%s', 'now'), 'superadmin-001');

-- Students (Active)
INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, account_status, is_email_verified, is_phone_verified, created_at, updated_at, approved_by_id)
VALUES 
  ('student-001', 'james.omondi@example.com', '+254712345001', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'STUDENT', 'James', 'Omondi', 'ACTIVE', 1, 1, strftime('%s', 'now', '-90 days'), strftime('%s', 'now'), 'admin1-001'),
  ('student-002', 'mary.njeri@example.com', '+254712345002', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'STUDENT', 'Mary', 'Njeri', 'ACTIVE', 1, 1, strftime('%s', 'now', '-85 days'), strftime('%s', 'now'), 'admin1-001'),
  ('student-003', 'peter.kamau@example.com', '+254712345003', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'STUDENT', 'Peter', 'Kamau', 'ACTIVE', 1, 1, strftime('%s', 'now', '-80 days'), strftime('%s', 'now'), 'admin1-001'),
  ('student-004', 'faith.akinyi@example.com', '+254712345004', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'STUDENT', 'Faith', 'Akinyi', 'ACTIVE', 1, 1, strftime('%s', 'now', '-75 days'), strftime('%s', 'now'), 'admin1-001'),
  ('student-005', 'david.kipchoge@example.com', '+254712345005', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'STUDENT', 'David', 'Kipchoge', 'ACTIVE', 1, 1, strftime('%s', 'now', '-70 days'), strftime('%s', 'now'), 'admin1-001');

-- Students (Pending Approval)
INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, account_status, is_email_verified, is_phone_verified, created_at, updated_at)
VALUES 
  ('student-006', 'lucy.wambui@example.com', '+254712345006', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'STUDENT', 'Lucy', 'Wambui', 'PENDING', 1, 1, strftime('%s', 'now', '-2 days'), strftime('%s', 'now', '-2 days')),
  ('student-007', 'samuel.otieno@example.com', '+254712345007', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSBL9fSu', 'STUDENT', 'Samuel', 'Otieno', 'PENDING', 1, 1, strftime('%s', 'now', '-1 days'), strftime('%s', 'now', '-1 days'));

-- Insert test requests with various statuses

-- Request 1: PAID (completed workflow)
INSERT INTO requests (id, student_id, type, amount, reason, status, submitted_at, reviewed_at, verified_at, paid_at)
VALUES 
  ('req-001', 'student-001', 'SCHOOL_FEES', 15000.00, 'Tuition payment for Term 1, 2024. Attached fee structure and admission letter.', 'PAID', strftime('%s', 'now', '-30 days'), strftime('%s', 'now', '-28 days'), strftime('%s', 'now', '-27 days'), strftime('%s', 'now', '-26 days'));

-- Request 2: VERIFIED (awaiting payment)
INSERT INTO requests (id, student_id, type, amount, reason, status, submitted_at, reviewed_at, verified_at)
VALUES 
  ('req-002', 'student-002', 'MEDICAL_EXPENSES', 8500.00, 'Medical treatment for malaria. Hospital bill and prescription attached.', 'VERIFIED', strftime('%s', 'now', '-10 days'), strftime('%s', 'now', '-8 days'), strftime('%s', 'now', '-7 days'));

-- Request 3: APPROVED (awaiting verification)
INSERT INTO requests (id, student_id, type, amount, reason, status, submitted_at, reviewed_at)
VALUES 
  ('req-003', 'student-003', 'SUPPLIES', 5000.00, 'School supplies including textbooks, notebooks, and stationery for new term.', 'APPROVED', strftime('%s', 'now', '-5 days'), strftime('%s', 'now', '-3 days'));

-- Request 4: UNDER_REVIEW
INSERT INTO requests (id, student_id, type, amount, reason, status, submitted_at)
VALUES 
  ('req-004', 'student-004', 'SCHOOL_FEES', 12000.00, 'Exam fees for KCSE 2024. Fee structure from school attached.', 'UNDER_REVIEW', strftime('%s', 'now', '-2 days'));

-- Request 5: SUBMITTED (new request)
INSERT INTO requests (id, student_id, type, amount, reason, status, submitted_at)
VALUES 
  ('req-005', 'student-005', 'EMERGENCY', 3000.00, 'Emergency transport to hospital for family member. Medical report attached.', 'SUBMITTED', strftime('%s', 'now', '-1 days'));

-- Request 6: REJECTED
INSERT INTO requests (id, student_id, type, amount, reason, status, submitted_at, reviewed_at, rejection_reason)
VALUES 
  ('req-006', 'student-001', 'OTHER', 25000.00, 'Request for laptop purchase.', 'REJECTED', strftime('%s', 'now', '-20 days'), strftime('%s', 'now', '-18 days'), 'Amount exceeds policy limits for OTHER category. Please resubmit with detailed justification or reduce amount.');

-- Request 7: FLAGGED
INSERT INTO requests (id, student_id, type, amount, reason, status, submitted_at, reviewed_at, flag_reason)
VALUES 
  ('req-007', 'student-002', 'MEDICAL_EXPENSES', 45000.00, 'Surgery expenses.', 'FLAGGED', strftime('%s', 'now', '-15 days'), strftime('%s', 'now', '-13 days'), 'Amount significantly higher than average. Requires additional documentation and verification.');

-- Request 8: PENDING_DOCUMENTS
INSERT INTO requests (id, student_id, type, amount, reason, status, submitted_at, reviewed_at)
VALUES 
  ('req-008', 'student-003', 'SCHOOL_FEES', 18000.00, 'School fees for Term 2.', 'PENDING_DOCUMENTS', strftime('%s', 'now', '-12 days'), strftime('%s', 'now', '-10 days'));

-- Insert test documents
INSERT INTO documents (id, request_id, file_name, file_type, file_size, r2_key, r2_bucket, version, uploaded_by_id, uploaded_at, scan_status)
VALUES 
  ('doc-001', 'req-001', 'fee_structure_term1.pdf', 'application/pdf', 245678, 'documents/req-001/fee_structure_term1.pdf', 'financial-documents', 1, 'student-001', strftime('%s', 'now', '-30 days'), 'clean'),
  ('doc-002', 'req-001', 'admission_letter.pdf', 'application/pdf', 189234, 'documents/req-001/admission_letter.pdf', 'financial-documents', 1, 'student-001', strftime('%s', 'now', '-30 days'), 'clean'),
  ('doc-003', 'req-002', 'hospital_bill.pdf', 'application/pdf', 156789, 'documents/req-002/hospital_bill.pdf', 'financial-documents', 1, 'student-002', strftime('%s', 'now', '-10 days'), 'clean'),
  ('doc-004', 'req-003', 'supply_list.jpg', 'image/jpeg', 987654, 'documents/req-003/supply_list.jpg', 'financial-documents', 1, 'student-003', strftime('%s', 'now', '-5 days'), 'clean'),
  ('doc-005', 'req-004', 'exam_fees.pdf', 'application/pdf', 234567, 'documents/req-004/exam_fees.pdf', 'financial-documents', 1, 'student-004', strftime('%s', 'now', '-2 days'), 'clean'),
  ('doc-006', 'req-005', 'medical_report.pdf', 'application/pdf', 345678, 'documents/req-005/medical_report.pdf', 'financial-documents', 1, 'student-005', strftime('%s', 'now', '-1 days'), 'pending');

-- Insert status changes
INSERT INTO status_changes (id, request_id, from_status, to_status, changed_by_id, changed_at, reason)
VALUES 
  ('sc-001', 'req-001', 'SUBMITTED', 'UNDER_REVIEW', 'admin1-001', strftime('%s', 'now', '-28 days'), NULL),
  ('sc-002', 'req-001', 'UNDER_REVIEW', 'APPROVED', 'admin1-001', strftime('%s', 'now', '-28 days'), 'All documents verified. Request approved.'),
  ('sc-003', 'req-001', 'APPROVED', 'VERIFIED', 'admin2-001', strftime('%s', 'now', '-27 days'), 'Verification complete. Ready for payment.'),
  ('sc-004', 'req-001', 'VERIFIED', 'PAID', 'admin1-001', strftime('%s', 'now', '-26 days'), 'Payment completed successfully.'),
  ('sc-005', 'req-002', 'SUBMITTED', 'UNDER_REVIEW', 'admin1-001', strftime('%s', 'now', '-8 days'), NULL),
  ('sc-006', 'req-002', 'UNDER_REVIEW', 'APPROVED', 'admin1-001', strftime('%s', 'now', '-8 days'), 'Medical emergency verified. Approved.'),
  ('sc-007', 'req-002', 'APPROVED', 'VERIFIED', 'admin2-001', strftime('%s', 'now', '-7 days'), 'Verified. Awaiting payment processing.'),
  ('sc-008', 'req-003', 'SUBMITTED', 'UNDER_REVIEW', 'admin1-002', strftime('%s', 'now', '-3 days'), NULL),
  ('sc-009', 'req-003', 'UNDER_REVIEW', 'APPROVED', 'admin1-002', strftime('%s', 'now', '-3 days'), 'Supply list verified. Approved.'),
  ('sc-010', 'req-006', 'SUBMITTED', 'UNDER_REVIEW', 'admin1-001', strftime('%s', 'now', '-18 days'), NULL),
  ('sc-011', 'req-006', 'UNDER_REVIEW', 'REJECTED', 'admin1-001', strftime('%s', 'now', '-18 days'), 'Amount exceeds policy limits for OTHER category.'),
  ('sc-012', 'req-007', 'SUBMITTED', 'UNDER_REVIEW', 'admin1-001', strftime('%s', 'now', '-13 days'), NULL),
  ('sc-013', 'req-007', 'UNDER_REVIEW', 'FLAGGED', 'admin2-001', strftime('%s', 'now', '-13 days'), 'Amount significantly higher than average. Requires additional verification.');

-- Insert transactions
INSERT INTO transactions (id, request_id, amount, currency, mpesa_transaction_id, mpesa_receipt_number, phone_number, status, initiated_at, completed_at)
VALUES 
  ('txn-001', 'req-001', 15000.00, 'KES', 'MPESA123456789', 'QAB1CD2EFG', '+254712345001', 'completed', strftime('%s', 'now', '-26 days'), strftime('%s', 'now', '-26 days'));

-- Insert comments
INSERT INTO comments (id, request_id, author_id, content, created_at, is_internal)
VALUES 
  ('cmt-001', 'req-001', 'admin1-001', 'Documents look good. Processing approval.', strftime('%s', 'now', '-28 days'), 0),
  ('cmt-002', 'req-002', 'admin1-001', 'Medical emergency confirmed. Fast-tracking approval.', strftime('%s', 'now', '-8 days'), 1),
  ('cmt-003', 'req-003', 'admin1-002', 'Supply list matches school requirements. Approved.', strftime('%s', 'now', '-3 days'), 0),
  ('cmt-004', 'req-007', 'admin2-001', 'Need to verify hospital quotation. Amount seems high.', strftime('%s', 'now', '-13 days'), 1),
  ('cmt-005', 'req-008', 'admin1-001', 'Please upload current school ID and fee structure.', strftime('%s', 'now', '-10 days'), 0);

-- Insert document access logs
INSERT INTO document_access (id, document_id, user_id, accessed_at, ip_address)
VALUES 
  ('da-001', 'doc-001', 'admin1-001', strftime('%s', 'now', '-28 days'), '192.168.1.100'),
  ('da-002', 'doc-002', 'admin1-001', strftime('%s', 'now', '-28 days'), '192.168.1.100'),
  ('da-003', 'doc-001', 'admin2-001', strftime('%s', 'now', '-27 days'), '192.168.1.101'),
  ('da-004', 'doc-003', 'admin1-001', strftime('%s', 'now', '-8 days'), '192.168.1.100'),
  ('da-005', 'doc-004', 'admin1-002', strftime('%s', 'now', '-3 days'), '192.168.1.102');

-- Insert audit logs
INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, timestamp)
VALUES 
  ('audit-001', 'student-001', 'USER_LOGIN', 'User', 'student-001', '{"success": true}', '192.168.1.50', 'Mozilla/5.0', strftime('%s', 'now', '-30 days')),
  ('audit-002', 'student-001', 'REQUEST_CREATED', 'Request', 'req-001', '{"type": "SCHOOL_FEES", "amount": 15000}', '192.168.1.50', 'Mozilla/5.0', strftime('%s', 'now', '-30 days')),
  ('audit-003', 'admin1-001', 'REQUEST_STATUS_CHANGED', 'Request', 'req-001', '{"from": "SUBMITTED", "to": "APPROVED"}', '192.168.1.100', 'Mozilla/5.0', strftime('%s', 'now', '-28 days')),
  ('audit-004', 'admin2-001', 'REQUEST_STATUS_CHANGED', 'Request', 'req-001', '{"from": "APPROVED", "to": "VERIFIED"}', '192.168.1.101', 'Mozilla/5.0', strftime('%s', 'now', '-27 days')),
  ('audit-005', 'admin1-001', 'PAYMENT_INITIATED', 'Transaction', 'txn-001', '{"amount": 15000, "phone": "+254712345001"}', '192.168.1.100', 'Mozilla/5.0', strftime('%s', 'now', '-26 days')),
  ('audit-006', NULL, 'PAYMENT_COMPLETED', 'Transaction', 'txn-001', '{"mpesa_receipt": "QAB1CD2EFG"}', '192.168.1.100', 'M-Pesa Webhook', strftime('%s', 'now', '-26 days'));

-- Insert notifications
INSERT INTO notifications (id, user_id, type, channel, subject, message, status, sent_at, retry_count, created_at)
VALUES 
  ('notif-001', 'student-001', 'email', 'email', 'Request Submitted Successfully', 'Your request for SCHOOL_FEES has been submitted and is under review.', 'sent', strftime('%s', 'now', '-30 days'), 0, strftime('%s', 'now', '-30 days')),
  ('notif-002', 'student-001', 'sms', 'sms', NULL, 'Bethel: Your request req-001 status is now APPROVED. Check your account for details.', 'sent', strftime('%s', 'now', '-28 days'), 0, strftime('%s', 'now', '-28 days')),
  ('notif-003', 'student-001', 'email', 'email', 'Payment Confirmed', 'Payment of KES 15000.00 has been completed. M-Pesa receipt: QAB1CD2EFG', 'sent', strftime('%s', 'now', '-26 days'), 0, strftime('%s', 'now', '-26 days')),
  ('notif-004', 'student-002', 'email', 'email', 'Request Submitted Successfully', 'Your request for MEDICAL_EXPENSES has been submitted and is under review.', 'sent', strftime('%s', 'now', '-10 days'), 0, strftime('%s', 'now', '-10 days')),
  ('notif-005', 'student-006', 'email', 'email', 'Registration Pending Approval', 'Your registration is pending admin approval. You will be notified once approved.', 'sent', strftime('%s', 'now', '-2 days'), 0, strftime('%s', 'now', '-2 days'));

-- Insert public statistics (monthly aggregates)
INSERT INTO public_statistics (id, date, total_received, total_disbursed, requests_approved, requests_rejected, requests_by_type, amounts_by_type, updated_at)
VALUES 
  ('stat-2024-01', '2024-01-01', 500000.00, 475000.00, 35, 3, '{"SCHOOL_FEES": 20, "MEDICAL_EXPENSES": 10, "SUPPLIES": 5}', '{"SCHOOL_FEES": 300000, "MEDICAL_EXPENSES": 120000, "SUPPLIES": 55000}', strftime('%s', 'now', '-60 days')),
  ('stat-2024-02', '2024-02-01', 450000.00, 425000.00, 32, 4, '{"SCHOOL_FEES": 18, "MEDICAL_EXPENSES": 9, "SUPPLIES": 5}', '{"SCHOOL_FEES": 270000, "MEDICAL_EXPENSES": 108000, "SUPPLIES": 47000}', strftime('%s', 'now', '-30 days'));

-- Verification queries
SELECT 'Users created:' as info, COUNT(*) as count FROM users;
SELECT 'Requests created:' as info, COUNT(*) as count FROM requests;
SELECT 'Documents created:' as info, COUNT(*) as count FROM documents;
SELECT 'Transactions created:' as info, COUNT(*) as count FROM transactions;
SELECT 'Audit logs created:' as info, COUNT(*) as count FROM audit_logs;
SELECT 'Notifications created:' as info, COUNT(*) as count FROM notifications;

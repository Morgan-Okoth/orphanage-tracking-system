# Implementation Plan: Financial Transparency and Accountability System

## Overview

This implementation plan breaks down the Financial Transparency and Accountability System into discrete, manageable tasks. The system is built using Next.js 14+ (App Router) for the frontend, Cloudflare Workers with Hono for the backend API, Cloudflare D1 (SQLite) for the database, and integrates with M-Pesa for payments, Africa's Talking for SMS, and Cloudflare services for storage, caching, and queues.

The implementation follows a logical sequence: infrastructure setup → authentication foundation → core request workflow → payment integration → dashboards and reporting → optimization.

## Tasks

- [x] 1. Set up project infrastructure and development environment
  - Initialize Next.js 14+ project with TypeScript and App Router
  - Initialize Cloudflare Workers project with Wrangler CLI
  - Configure Drizzle ORM for D1 database
  - Set up Material-UI v5 with custom theme
  - Configure ESLint, Prettier, and TypeScript strict mode
  - Set up environment variables for local development
  - Create project directory structure for frontend and backend
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [x] 2. Create database schema and migrations
  - [x] 2.1 Define Drizzle ORM schema for all tables
    - Create users table with role-based fields
    - Create requests table with status workflow fields
    - Create documents table with R2 storage references
    - Create transactions table for M-Pesa payment tracking
    - Create audit_logs table for immutable logging
    - Create notifications table for email/SMS tracking
    - Create public_statistics table for transparency dashboard
    - Create comments, status_changes, and document_access tables
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 7.1, 8.1, 9.1, 11.1_

  - [x] 2.2 Create database indexes for query optimization
    - Add indexes on users(email), users(phone), users(account_status)
    - Add indexes on requests(student_id), requests(status), requests(submitted_at)
    - Add indexes on documents(request_id), audit_logs(timestamp)
    - _Requirements: 16.5_

  - [x] 2.3 Create initial database migration scripts
    - Write D1 migration for schema creation
    - Write seed data script for development environment
    - Test migration rollback functionality
    - _Requirements: 2.1, 13.1_

- [x] 3. Implement authentication and authorization system
  - [x] 3.1 Create JWT authentication service in Cloudflare Workers
    - Implement password hashing with bcrypt (12 rounds minimum)
    - Implement JWT token generation with 1-hour expiration
    - Implement refresh token generation with 7-day expiration
    - Store refresh tokens in Cloudflare KV with expiration
    - Create token verification middleware
    - _Requirements: 1.1, 1.2, 1.5, 15.4_

  - [x] 3.2 Create role-based authorization middleware
    - Define permission matrix for STUDENT, ADMIN_LEVEL_1, ADMIN_LEVEL_2
    - Implement authorization middleware for route protection
    - Create helper functions for permission checking
    - _Requirements: 1.3, 1.4_

  - [x] 3.3 Implement authentication API endpoints
    - POST /api/v1/auth/register - user registration with pending status
    - POST /api/v1/auth/login - login with JWT token generation
    - POST /api/v1/auth/logout - logout with token revocation
    - POST /api/v1/auth/refresh-token - refresh access token
    - GET /api/v1/auth/me - get current user profile
    - _Requirements: 1.1, 1.2, 2.1_

  - [x] 3.4 Write unit tests for authentication service
    - Test password hashing and verification
    - Test JWT token generation and validation
    - Test token expiration handling
    - Test refresh token rotation
    - _Requirements: 1.1, 1.5_

- [x] 4. Build user management system
  - [x] 4.1 Implement user registration and approval workflow
    - Create user registration endpoint with email/phone validation
    - Implement admin approval endpoint for pending accounts
    - Implement admin rejection endpoint with reason
    - Send email notification on registration
    - Send email notification on approval/rejection
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 9.1, 9.2_

  - [x] 4.2 Create user management API endpoints
    - GET /api/v1/users - list all users (admin only)
    - GET /api/v1/users/:id - get user details
    - PATCH /api/v1/users/:id - update user profile
    - POST /api/v1/users/:id/approve - approve pending user
    - POST /api/v1/users/:id/reject - reject pending user
    - POST /api/v1/users/:id/reactivate - reactivate deactivated user
    - DELETE /api/v1/users/:id - deactivate user (soft delete)
    - _Requirements: 2.2, 2.3, 2.6, 13.1, 13.3, 13.4, 13.5, 13.7_

  - [x] 4.3 Implement audit logging for user actions
    - Log user registration attempts
    - Log login attempts (success and failure)
    - Log user approval/rejection actions
    - Log user deactivation/reactivation
    - _Requirements: 8.1, 8.5, 13.7_

  - [x] 4.4 Write integration tests for user management
    - Test user registration flow
    - Test admin approval workflow
    - Test user deactivation and reactivation
    - Test authorization for admin-only endpoints
    - _Requirements: 2.1, 2.2, 13.1_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement document storage and management
  - [x] 6.1 Create Cloudflare R2 storage service
    - Implement document upload to R2 with unique keys
    - Implement pre-signed URL generation for downloads (5-minute expiration)
    - Implement document deletion (soft delete in database)
    - Configure R2 bucket with versioning enabled
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 6.2 Implement document validation and security
    - Validate file type (PDF, JPG, PNG, JPEG only)
    - Validate file size (10MB maximum)
    - Sanitize file names to prevent path traversal
    - Implement malware scanning placeholder (log for future integration)
    - _Requirements: 3.4, 3.5, 4.6, 4.7_

  - [x] 6.3 Create document management API endpoints
    - POST /api/v1/documents - upload document with request association
    - GET /api/v1/documents/:id - get document metadata
    - GET /api/v1/documents/:id/download - generate pre-signed download URL
    - GET /api/v1/requests/:id/documents - list all documents for request
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 6.4 Implement document access control and logging
    - Verify user authorization before document access
    - Log all document access attempts to document_access table
    - Students can only access their own documents
    - Admins can access all documents
    - _Requirements: 4.5, 8.7_

  - [x] 6.5 Write integration tests for document management
    - Test document upload with validation
    - Test file type and size restrictions
    - Test document access control
    - Test pre-signed URL generation
    - _Requirements: 3.4, 3.5, 4.5_

- [x] 7. Build financial request submission and workflow
  - [x] 7.1 Create request submission API endpoint
    - POST /api/v1/requests - create request with multipart form data
    - Validate request type, amount, reason, and documents
    - Set initial status to SUBMITTED
    - Upload documents to R2 and create document records
    - Send notification to student and Admin_Level_1
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 9.1, 9.2_

  - [x] 7.2 Implement request status transition logic
    - Create status transition validation function
    - Implement status change tracking in status_changes table
    - Prevent invalid status transitions
    - Log all status changes to audit log
    - _Requirements: 8.6_

  - [x] 7.3 Create request management API endpoints
    - GET /api/v1/requests - list requests (filtered by role)
    - GET /api/v1/requests/:id - get request details with documents
    - PATCH /api/v1/requests/:id - update request (draft only)
    - DELETE /api/v1/requests/:id - soft delete draft request
    - GET /api/v1/requests/:id/history - get status change history
    - _Requirements: 3.1, 3.2, 14.4_

  - [x] 7.4 Implement request review workflow for Admin Level 1
    - POST /api/v1/requests/:id/review - start review (SUBMITTED → UNDER_REVIEW)
    - POST /api/v1/requests/:id/approve - approve request (UNDER_REVIEW → APPROVED)
    - POST /api/v1/requests/:id/reject - reject request with reason
    - POST /api/v1/requests/:id/request-docs - request additional documents (→ PENDING_DOCUMENTS)
    - Send notifications on each status change
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 9.1, 9.2_

  - [x] 7.5 Implement request verification workflow for Admin Level 2
    - POST /api/v1/requests/:id/verify - verify request (APPROVED → VERIFIED)
    - POST /api/v1/requests/:id/flag - flag request with reason (→ FLAGGED)
    - Allow Admin_Level_2 to add audit notes
    - Send notifications to relevant parties
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 7.6 Implement comment system for requests
    - POST /api/v1/requests/:id/comments - add comment to request
    - GET /api/v1/requests/:id/comments - get all comments for request
    - Support internal comments (admin-only visibility)
    - Send notifications when comments are added
    - _Requirements: 5.5, 9.4, 9.5_

  - [x] 7.7 Write integration tests for request workflow
    - Test request submission with documents
    - Test status transition validation
    - Test admin review and approval flow
    - Test admin rejection with reason
    - Test comment system
    - _Requirements: 3.1, 3.2, 5.1, 5.2, 5.3_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integrate M-Pesa payment gateway
  - [x] 9.1 Create M-Pesa service in Cloudflare Workers
    - Implement OAuth token generation for M-Pesa API
    - Implement STK Push initiation for payments
    - Store M-Pesa credentials in Cloudflare environment variables
    - _Requirements: 7.1_

  - [x] 9.2 Implement payment initiation endpoint
    - POST /api/v1/payments/initiate - initiate M-Pesa payment
    - Validate request status is VERIFIED before payment
    - Create transaction record with pending status
    - Call M-Pesa STK Push API
    - Return checkout request ID to admin
    - _Requirements: 7.1, 7.5_

  - [x] 9.3 Implement M-Pesa callback webhook
    - POST /api/v1/payments/webhook - handle M-Pesa callback
    - Verify callback authenticity
    - Update transaction status based on callback result
    - Update request status to PAID on successful payment
    - Log payment failure reason on failed payment
    - Send payment confirmation notification to student
    - _Requirements: 7.2, 7.3, 7.4, 7.6_

  - [x] 9.4 Create payment query endpoints
    - GET /api/v1/payments/:id - get payment details
    - GET /api/v1/payments/request/:requestId - get payment for request
    - GET /api/v1/payments - list all payments (admin only)
    - _Requirements: 7.3_

  - [x] 9.5 Implement payment audit logging
    - Log payment initiation attempts
    - Log payment completion with transaction details
    - Log payment failures with error details
    - Encrypt transaction records at rest
    - _Requirements: 7.7, 8.1, 8.6_

  - [x] 9.6 Write integration tests for payment system (with mocked M-Pesa API)
    - Test payment initiation with valid request
    - Test payment rejection for non-verified requests
    - Test successful payment callback handling
    - Test failed payment callback handling
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

- [x] 10. Implement notification system with Cloudflare Queues
  - [x] 10.1 Create notification service with queue integration
    - Set up Cloudflare Queue for email notifications
    - Set up Cloudflare Queue for SMS notifications
    - Create queue producer functions for sending notifications
    - Create queue consumer worker for processing notifications
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 10.2 Integrate email notification service
    - Configure SendGrid API for email sending
    - Create email templates for registration, approval, rejection
    - Create email templates for request status changes
    - Create email template for payment confirmation
    - Implement retry logic for failed email sends (max 3 retries)
    - Log all email notifications to notifications table
    - _Requirements: 9.1, 9.2, 9.6, 9.7_

  - [x] 10.3 Integrate SMS notification service (Africa's Talking)
    - Configure Africa's Talking API credentials
    - Create SMS templates for request status changes
    - Create SMS template for payment confirmation
    - Implement retry logic for failed SMS sends (max 3 retries)
    - Log all SMS notifications to notifications table
    - _Requirements: 9.1, 9.2, 9.6, 9.7_

  - [x] 10.4 Create notification management endpoints
    - GET /api/v1/notifications - get user notifications
    - GET /api/v1/notifications/unread-count - get unread count
    - PATCH /api/v1/notifications/:id/read - mark notification as read
    - PATCH /api/v1/notifications/read-all - mark all as read
    - _Requirements: 9.7_

  - [x] 10.5 Write integration tests for notification system
    - Test email queue producer and consumer
    - Test SMS queue producer and consumer
    - Test notification retry logic
    - Test notification logging
    - _Requirements: 9.1, 9.2, 9.6_

- [x] 11. Build admin dashboards and monitoring
  - [x] 11.1 Create Admin Level 1 dashboard API endpoint
    - GET /api/v1/admin/dashboard - get dashboard statistics
    - Return count of requests by status
    - Return total disbursed funds for current month
    - Return pending actions requiring attention
    - Cache dashboard data in Cloudflare KV (5-minute TTL)
    - _Requirements: 10.1, 10.2, 10.5, 10.7_

  - [x] 11.2 Create Admin Level 2 dashboard API endpoint
    - GET /api/v1/admin/auditor-dashboard - get auditor dashboard
    - Return flagged cases requiring attention
    - Return recent audit log entries
    - Return anomaly detection results
    - _Requirements: 10.3_

  - [x] 11.3 Implement audit log query endpoint
    - GET /api/v1/audit-logs - query audit logs with filters
    - Support filtering by user, action, date range
    - Implement pagination (50 items per page)
    - Restrict access to Admin_Level_2 only
    - _Requirements: 8.4, 12.7_

  - [x] 11.4 Write integration tests for admin dashboards
    - Test dashboard statistics calculation
    - Test audit log querying with filters
    - Test authorization for admin-only endpoints
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 12. Implement public transparency dashboard
  - [x] 12.1 Create public statistics aggregation service
    - Implement daily aggregation job for public statistics
    - Calculate total received, total disbursed, requests by type
    - Anonymize all student information
    - Store aggregated data in public_statistics table
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.7_

  - [x] 12.2 Create public transparency API endpoints
    - GET /api/v1/public/statistics - get overall statistics (no auth)
    - GET /api/v1/public/statistics/monthly - get monthly breakdown
    - GET /api/v1/public/statistics/by-type - get statistics by request type
    - Cache public endpoints with 1-hour TTL
    - _Requirements: 11.1, 11.2, 11.3, 11.6_

  - [x] 12.3 Implement public dashboard charts data endpoint
    - GET /api/v1/public/charts/funding - get funding chart data
    - Return data formatted for chart visualization
    - Include month-over-month trends
    - _Requirements: 11.6_

  - [x] 12.4 Write integration tests for public dashboard
    - Test statistics aggregation logic
    - Test data anonymization
    - Test public endpoint accessibility without auth
    - _Requirements: 11.1, 11.4, 11.5_

- [x] 13. Implement AI-assisted reporting and anomaly detection
  - [x] 13.1 Create AI service using Cloudflare Workers AI
    - Configure Cloudflare Workers AI with Llama 2 model
    - Implement monthly summary generation function
    - Create prompt templates for financial summaries
    - _Requirements: 12.5_

  - [x] 13.2 Implement anomaly detection algorithms
    - Detect repeated requests from same student (>3 in 30 days)
    - Detect amount outliers (>3 standard deviations from mean)
    - Flag suspicious patterns for Admin_Level_2 review
    - _Requirements: 12.2, 12.3, 12.4_

  - [x] 13.3 Create reporting API endpoints
    - GET /api/v1/reports/monthly - generate monthly report with AI summary
    - GET /api/v1/reports/anomalies - get anomaly detection results
    - POST /api/v1/reports/generate - generate custom report
    - GET /api/v1/reports/:id/download - download generated report
    - _Requirements: 12.1, 12.2, 12.6, 12.7_

  - [x] 13.4 Write integration tests for AI reporting
    - Test monthly report generation
    - Test anomaly detection algorithms
    - Test AI summary generation (with mocked AI service)
    - _Requirements: 12.1, 12.2, 12.5_

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Build Next.js frontend application
  - [x] 15.1 Create authentication UI components
    - Create LoginForm component with email/password validation
    - Create RegisterForm component with role selection
    - Create ProtectedRoute wrapper component
    - Implement AuthContext for global auth state
    - Create login page (/login)
    - Create registration page (/register)
    - _Requirements: 1.1, 2.1_

  - [x] 15.2 Create student dashboard and request management UI
    - Create student dashboard page with request list
    - Create RequestForm component with document upload
    - Create RequestList component with status badges
    - Create RequestDetail page with timeline and comments
    - Create DocumentUpload component with drag-and-drop
    - Implement request submission flow
    - _Requirements: 2.5, 3.1, 3.2, 17.1, 17.2, 17.3_

  - [x] 15.3 Create Admin Level 1 dashboard and review UI
    - Create Admin Level 1 dashboard with statistics
    - Create request review page with document viewer
    - Create approval/rejection modal with reason input
    - Create comment thread component
    - Implement request review workflow UI
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 10.1, 10.2_

  - [x] 15.4 Create Admin Level 2 dashboard and verification UI
    - Create Admin Level 2 dashboard with flagged cases
    - Create verification page with audit notes
    - Create anomaly detection results display
    - Create audit log viewer with filters
    - _Requirements: 6.1, 6.2, 6.3, 10.3_

  - [x] 15.5 Create user management UI for admins
    - Create user list page with filters
    - Create pending approvals page
    - Create user approval/rejection modal
    - Create user deactivation confirmation dialog
    - _Requirements: 2.2, 2.3, 13.1, 13.3, 13.4_

  - [x] 15.6 Create public transparency dashboard UI
    - Create public dashboard page (no auth required)
    - Create FundingChart component with Chart.js
    - Create StatisticsCard components for key metrics
    - Implement responsive layout for mobile devices
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 17.1_

  - [x] 15.7 Implement payment initiation UI
    - Create payment initiation modal for Admin Level 1
    - Display M-Pesa phone number input
    - Show payment status and confirmation
    - _Requirements: 7.1, 7.6_

  - [x] 15.8 Write component tests for frontend
    - Test authentication forms with validation
    - Test request submission flow
    - Test admin review workflow
    - Test public dashboard rendering
    - _Requirements: 1.1, 3.1, 5.1, 11.1_

- [x] 16. Implement mobile-first optimizations
  - [x] 16.1 Configure Next.js for performance optimization
    - Enable Next.js Image optimization
    - Configure code splitting and dynamic imports
    - Implement React Server Components where applicable
    - Set up static generation for public pages
    - Configure caching headers for static assets
    - _Requirements: 16.1, 16.2, 16.4, 16.6_

  - [x] 16.2 Implement Progressive Web App (PWA) features
    - Add service worker for offline support
    - Create manifest.json for PWA installation
    - Implement offline form draft saving with IndexedDB
    - Add sync functionality for offline submissions
    - _Requirements: 17.3_

  - [x] 16.3 Optimize for low-bandwidth environments
    - Implement lazy loading for images and heavy components
    - Add loading skeletons for better perceived performance
    - Compress images and use WebP format
    - Implement pagination for large lists (50 items per page)
    - Add connection speed detection and adaptive loading
    - _Requirements: 16.1, 16.2, 16.4, 16.5_

  - [x] 16.4 Implement responsive design and accessibility
    - Ensure all pages are responsive (320px to 2560px)
    - Optimize touch targets (minimum 44x44 pixels)
    - Add ARIA labels and semantic HTML
    - Implement keyboard navigation support
    - Test with screen readers
    - _Requirements: 17.1, 17.2, 17.6, 17.7_

  - [x] 16.5 Write performance tests
    - Test page load times on 3G connection
    - Test image optimization and lazy loading
    - Test offline functionality
    - Test responsive design on multiple screen sizes
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [~] 17. Implement data security and encryption
  - [x] 17.1 Configure encryption for sensitive data
    - Implement AES-256 encryption for sensitive database fields
    - Configure Cloudflare R2 server-side encryption
    - Ensure TLS 1.3 for all API communications
    - Store encryption keys in Cloudflare secrets
    - _Requirements: 15.1, 15.2, 15.3, 15.5_

  - [x] 17.2 Implement security headers and CORS
    - Configure Content Security Policy headers
    - Add HSTS headers with 1-year max-age
    - Configure CORS for frontend-backend communication
    - Add rate limiting middleware (100 req/15min for public, 1000 req/15min for auth)
    - _Requirements: 15.2_

  - [x] 17.3 Implement input validation and sanitization
    - Create Zod schemas for all API endpoints
    - Implement XSS prevention with DOMPurify
    - Add SQL injection prevention (Drizzle ORM handles this)
    - Sanitize file names and user inputs
    - _Requirements: 3.3, 15.7_

  - [x] 17.4 Write security tests
    - Test encryption and decryption functions
    - Test input validation with malicious inputs
    - Test authorization for protected endpoints
    - Test rate limiting
    - _Requirements: 15.1, 15.2, 15.3, 15.7_

- [x] 18. Implement backup and recovery system
  - [x] 18.1 Configure automated database backups
    - Set up daily D1 database backups at 2:00 AM
    - Implement automatic retry on backup failure (1-hour delay)
    - _Requirements: 18.5, 18.6_

  - [x] 18.3 Create backup restoration procedure
    - Document step-by-step restoration process
    - Create restoration script for D1 database
    - Test restoration to verify backup integrity
    - _Requirements: 18.7_

- [x] 19. Implement request archival system
  - [x] 19.1 Create automated archival job
    - Implement scheduled job to archive requests (PAID status, 90 days unchanged)
    - Update request status to ARCHIVED
    - Maintain all associated data (documents, comments, history)
    - _Requirements: 14.1, 14.2_

  - [x] 19.2 Create archived request query endpoints
    - GET /api/v1/requests/archived - search archived requests
    - Support filtering by date range, student, amount
    - Implement pagination for archived results
    - _Requirements: 14.3, 14.4_

  - [x] 19.3 Implement archival retention policy
    - Ensure archived requests retained for minimum 7 years
    - Include archived requests in annual reports
    - Prevent status changes to archived requests
    - _Requirements: 14.5, 14.6, 14.7_

- [x] 20. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Deploy to Cloudflare infrastructure
  - [x] 21.1 Configure Cloudflare Pages for frontend
    - Connect GitHub repository to Cloudflare Pages
    - Configure build settings for Next.js
    - Set up production environment variables
    - Configure custom domain and SSL certificate
    - _Requirements: 16.1, 16.6_

  - [x] 21.2 Deploy Cloudflare Workers for backend API
    - Configure wrangler.toml for production deployment
    - Set up D1 database bindings
    - Set up R2 bucket bindings
    - Set up KV namespace bindings
    - Set up Queue bindings
    - Deploy Workers with Wrangler CLI
    - _Requirements: 16.5_

  - [x] 21.3 Configure Cloudflare services
    - Create and configure D1 production database
    - Create and configure R2 buckets (documents, backups)
    - Create and configure KV namespaces (cache, sessions)
    - Create and configure Queues (email, SMS, reports)
    - Run database migrations on production D1
    - _Requirements: 16.5_

  - [x] 21.4 Set up monitoring and logging
    - Configure Cloudflare Analytics for frontend
    - Configure Cloudflare Logs for Workers
    - Set up Sentry for error tracking
    - Create alerting rules for critical errors
    - _Requirements: 18.5, 18.6_

  - [x] 21.5 Configure external service integrations
    - Set up M-Pesa production API credentials
    - Set up SendGrid production API key
    - Set up Africa's Talking production credentials
    - Configure callback URLs for production
    - Test all external integrations in production
    - _Requirements: 7.1, 9.2, 9.3_

- [x] 22. Final testing and documentation
  - [x] 22.1 Run end-to-end tests in production environment
    - Test complete request submission and approval flow
    - Test payment integration with M-Pesa sandbox
    - Test email and SMS notifications
    - Test public transparency dashboard
    - Test admin dashboards and reporting
    - _Requirements: 3.1, 5.1, 6.1, 7.1, 11.1_

  - [x] 22.2 Create user documentation
    - Write user guide for students (request submission)
    - Write admin guide for Level 1 (review and approval)
    - Write admin guide for Level 2 (verification and auditing)
    - Create FAQ document
    - _Requirements: 2.1, 5.1, 6.1_

  - [x] 22.3 Create technical documentation
    - Document API endpoints with OpenAPI/Swagger
    - Document database schema and relationships
    - Document deployment procedures
    - Document backup and recovery procedures
    - Document security best practices
    - _Requirements: 15.1, 18.7_

  - [x] 22.4 Perform security audit
    - Review all authentication and authorization logic
    - Review data encryption implementation
    - Review input validation and sanitization
    - Review audit logging completeness
    - Test for common vulnerabilities (OWASP Top 10)
    - _Requirements: 1.3, 15.1, 15.2, 15.7_

- [x] 23. Final checkpoint - Production readiness verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation and allow for user feedback
- The implementation follows a logical sequence: infrastructure → auth → core workflow → integrations → UI → optimization → deployment
- All sensitive credentials must be stored in Cloudflare environment variables/secrets
- The system uses TypeScript throughout for type safety
- Cloudflare's edge network provides global performance and automatic scaling
- The design prioritizes mobile-first and low-bandwidth optimization
- All financial data is encrypted at rest and in transit
- Immutable audit logging ensures full accountability
- The public transparency dashboard maintains donor trust while protecting beneficiary privacy

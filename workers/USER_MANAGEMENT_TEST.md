# User Management System - Manual Testing Guide

This document provides manual testing instructions for the user management system implemented in Task 4.

## Prerequisites

1. Start the development server:
```bash
cd orphanage-tracking-system/workers
npm run dev
```

2. Ensure the database is initialized:
```bash
npm run db:init
```

## Test Scenarios

### 1. User Registration (Sub-task 4.1)

**Test Case 1.1: Register a new student**

```bash
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "phone": "+254712345678",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe",
    "role": "STUDENT"
  }'
```

**Expected Response:**
- Status: 201 Created
- Body contains: `userId`, `email`, `accountStatus: "PENDING"`
- Notification queued in database

**Test Case 1.2: Register with duplicate email**

```bash
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "phone": "+254712345679",
    "password": "SecurePass123!",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "STUDENT"
  }'
```

**Expected Response:**
- Status: 409 Conflict
- Error code: `USER_ALREADY_EXISTS`

### 2. User Approval Workflow (Sub-task 4.1)

**Test Case 2.1: Admin approves pending user**

First, create an admin user and login:

```bash
# Register admin (manually set to ACTIVE in database for testing)
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "phone": "+254700000001",
    "password": "AdminPass123!",
    "firstName": "Admin",
    "lastName": "User",
    "role": "ADMIN_LEVEL_1"
  }'

# Login as admin
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "AdminPass123!"
  }'
```

Save the `accessToken` from the response, then approve the student:

```bash
curl -X POST http://localhost:8787/api/v1/users/{userId}/approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {accessToken}"
```

**Expected Response:**
- Status: 200 OK
- User `accountStatus` changed to `ACTIVE`
- Approval notification queued

**Test Case 2.2: Admin rejects pending user**

```bash
curl -X POST http://localhost:8787/api/v1/users/{userId}/reject \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {accessToken}" \
  -d '{
    "reason": "Incomplete documentation provided"
  }'
```

**Expected Response:**
- Status: 200 OK
- User `accountStatus` changed to `REJECTED`
- Rejection notification queued with reason

### 3. User Management API Endpoints (Sub-task 4.2)

**Test Case 3.1: List all users (Admin only)**

```bash
curl -X GET "http://localhost:8787/api/v1/users?page=1&limit=10" \
  -H "Authorization: Bearer {adminAccessToken}"
```

**Expected Response:**
- Status: 200 OK
- Paginated list of users
- No password hashes in response

**Test Case 3.2: List pending users**

```bash
curl -X GET http://localhost:8787/api/v1/users/pending \
  -H "Authorization: Bearer {adminAccessToken}"
```

**Expected Response:**
- Status: 200 OK
- List of users with `accountStatus: "PENDING"`

**Test Case 3.3: Get user by ID**

```bash
curl -X GET http://localhost:8787/api/v1/users/{userId} \
  -H "Authorization: Bearer {accessToken}"
```

**Expected Response:**
- Status: 200 OK
- User details without password hash
- Students can only view their own profile

**Test Case 3.4: Update user profile**

```bash
curl -X PATCH http://localhost:8787/api/v1/users/{userId} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {accessToken}" \
  -d '{
    "firstName": "Updated",
    "lastName": "Name",
    "phone": "+254712345680"
  }'
```

**Expected Response:**
- Status: 200 OK
- Updated user details
- `isPhoneVerified` reset to false if phone changed

**Test Case 3.5: Deactivate user**

```bash
curl -X DELETE http://localhost:8787/api/v1/users/{userId} \
  -H "Authorization: Bearer {adminAccessToken}"
```

**Expected Response:**
- Status: 200 OK
- User `accountStatus` changed to `DEACTIVATED`
- Deactivation notification queued

**Test Case 3.6: Reactivate user**

```bash
curl -X POST http://localhost:8787/api/v1/users/{userId}/reactivate \
  -H "Authorization: Bearer {adminAccessToken}"
```

**Expected Response:**
- Status: 200 OK
- User `accountStatus` changed to `ACTIVE`
- Reactivation notification queued

### 4. Audit Logging (Sub-task 4.3)

**Test Case 4.1: Verify audit logs are created**

After performing the above operations, check the audit logs in the database:

```bash
npm run db:verify
# Then query audit_logs table
```

**Expected Audit Log Entries:**
- `USER_CREATED` - for each registration
- `USER_APPROVED` - for user approvals
- `USER_REJECTED` - for user rejections (using USER_DEACTIVATED action)
- `USER_DEACTIVATED` - for user deactivations
- `USER_REACTIVATED` - for user reactivations (using USER_APPROVED action)

Each log entry should contain:
- `userId` - who performed the action
- `action` - the action type
- `resourceType` - "User"
- `resourceId` - the affected user ID
- `metadata` - additional context (email, role, reason, etc.)
- `ipAddress` - request IP
- `userAgent` - request user agent
- `timestamp` - when the action occurred

### 5. Authorization Tests

**Test Case 5.1: Student cannot approve users**

```bash
curl -X POST http://localhost:8787/api/v1/users/{userId}/approve \
  -H "Authorization: Bearer {studentAccessToken}"
```

**Expected Response:**
- Status: 403 Forbidden
- Error code: `FORBIDDEN`

**Test Case 5.2: Student cannot list all users**

```bash
curl -X GET http://localhost:8787/api/v1/users \
  -H "Authorization: Bearer {studentAccessToken}"
```

**Expected Response:**
- Status: 403 Forbidden
- Error code: `FORBIDDEN`

**Test Case 5.3: Student can only view own profile**

```bash
curl -X GET http://localhost:8787/api/v1/users/{otherUserId} \
  -H "Authorization: Bearer {studentAccessToken}"
```

**Expected Response:**
- Status: 403 Forbidden
- Error message: "You can only view your own profile"

### 6. Notification Queue Verification

**Test Case 6.1: Check notifications table**

After registration, approval, rejection, etc., verify notifications are queued:

```sql
SELECT * FROM notifications WHERE user_id = '{userId}' ORDER BY created_at DESC;
```

**Expected Results:**
- Registration notification with `type: 'email'`, `status: 'pending'`
- Approval notification with both email and SMS
- Rejection notification with reason in message
- Deactivation notification
- Reactivation notification with both email and SMS

## Database Verification

### Check User Status Changes

```sql
-- View all users and their statuses
SELECT id, email, role, account_status, created_at, approved_by_id 
FROM users 
ORDER BY created_at DESC;

-- View pending users
SELECT id, email, role, account_status, created_at 
FROM users 
WHERE account_status = 'PENDING';

-- View active users
SELECT id, email, role, account_status, created_at 
FROM users 
WHERE account_status = 'ACTIVE';
```

### Check Audit Logs

```sql
-- View all audit logs
SELECT id, user_id, action, resource_type, resource_id, timestamp 
FROM audit_logs 
ORDER BY timestamp DESC 
LIMIT 20;

-- View user-related audit logs
SELECT id, user_id, action, resource_type, resource_id, metadata, timestamp 
FROM audit_logs 
WHERE action LIKE 'USER_%' 
ORDER BY timestamp DESC;
```

### Check Notifications

```sql
-- View all notifications
SELECT id, user_id, type, channel, subject, status, created_at 
FROM notifications 
ORDER BY created_at DESC 
LIMIT 20;

-- View pending notifications
SELECT id, user_id, type, channel, subject, status, retry_count 
FROM notifications 
WHERE status = 'pending';
```

## Success Criteria

All sub-tasks completed successfully if:

### Sub-task 4.1: User Registration and Approval Workflow
- ✅ Users can register with email/phone validation
- ✅ Registration creates user with PENDING status
- ✅ Admin can approve pending users (status → ACTIVE)
- ✅ Admin can reject pending users (status → REJECTED) with reason
- ✅ Email notifications queued on registration
- ✅ Email and SMS notifications queued on approval/rejection

### Sub-task 4.2: User Management API Endpoints
- ✅ GET /api/v1/users - lists all users (admin only, paginated)
- ✅ GET /api/v1/users/pending - lists pending users (admin only)
- ✅ GET /api/v1/users/:id - gets user details (with ownership check)
- ✅ PATCH /api/v1/users/:id - updates user profile (with ownership check)
- ✅ POST /api/v1/users/:id/approve - approves pending user (admin only)
- ✅ POST /api/v1/users/:id/reject - rejects pending user (admin only)
- ✅ DELETE /api/v1/users/:id - deactivates user (admin only)
- ✅ POST /api/v1/users/:id/reactivate - reactivates user (admin only)

### Sub-task 4.3: Audit Logging
- ✅ User registration attempts logged
- ✅ Login attempts logged (already implemented in Task 3)
- ✅ User approval/rejection actions logged
- ✅ User deactivation/reactivation logged
- ✅ All logs include user ID, action, resource, metadata, IP, timestamp

## Notes

- Notifications are queued but not sent in this implementation (email/SMS sending will be implemented in a future task)
- The notification service creates entries in the `notifications` table with `status: 'pending'`
- A background worker or queue consumer would process these notifications
- For testing, you can manually update the admin user's `account_status` to `ACTIVE` in the database to bypass the approval workflow

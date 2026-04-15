# Authentication and Authorization Implementation

## Overview

This document describes the authentication and authorization system implemented for the Financial Transparency and Accountability System.

## Components Implemented

### 1. JWT Authentication Service (`services/authService.ts`)

**Features:**
- Password hashing using bcrypt with 12 rounds (minimum security requirement)
- JWT access token generation with 1-hour expiration
- Refresh token generation with 7-day expiration
- Refresh tokens stored in Cloudflare KV with automatic expiration
- Token verification and validation
- Token rotation on refresh (security best practice)
- User registration with pending status
- User login with credential verification

**Key Methods:**
- `hashPassword(password)` - Hash password with bcrypt (12 rounds)
- `verifyPassword(password, hash)` - Verify password against hash
- `generateAccessToken(userId, email, role)` - Generate JWT with 1-hour expiry
- `generateRefreshToken(userId)` - Generate refresh token stored in KV
- `verifyAccessToken(token)` - Verify and decode JWT
- `verifyRefreshToken(refreshToken)` - Verify refresh token from KV
- `register(data, db)` - Register new user with pending status
- `login(data, db)` - Authenticate user and generate tokens
- `refreshAccessToken(refreshToken, db)` - Refresh access token with rotation
- `logout(refreshToken)` - Revoke refresh token

### 2. Role-Based Authorization Middleware (`api/middleware/auth.ts`)

**Permission Matrix:**

**STUDENT:**
- `request:create` - Create financial requests
- `request:read:own` - Read own requests
- `request:update:own:draft` - Update own draft requests
- `document:upload:own` - Upload documents to own requests
- `document:read:own` - Read own documents
- `notification:read:own` - Read own notifications
- `comment:read:own` - Read comments on own requests

**ADMIN_LEVEL_1 (Operations Administrator):**
- `request:read:all` - Read all requests
- `request:review` - Review submitted requests
- `request:approve` - Approve requests
- `request:reject` - Reject requests
- `request:request-docs` - Request additional documents
- `document:read:all` - Read all documents
- `user:create` - Create new users
- `user:approve` - Approve pending users
- `user:deactivate` - Deactivate users
- `user:read:all` - Read all user data
- `payment:initiate` - Initiate payments
- `comment:create` - Add comments to requests
- `comment:read:all` - Read all comments
- `notification:read:own` - Read own notifications

**ADMIN_LEVEL_2 (Auditor):**
- `request:read:all` - Read all requests
- `request:verify` - Verify approved requests
- `request:flag` - Flag requests for review
- `request:reject` - Reject requests
- `document:read:all` - Read all documents
- `audit:read` - Read audit logs
- `report:generate` - Generate reports
- `user:read:all` - Read all user data
- `comment:create:internal` - Add internal comments
- `comment:read:all` - Read all comments
- `notification:read:own` - Read own notifications

**Middleware Functions:**
- `authMiddleware()` - Verify JWT and attach user to context
- `requireRole(...roles)` - Require specific role(s)
- `requirePermission(...permissions)` - Require specific permission(s)
- `optionalAuth()` - Optional authentication (for public endpoints)

**Helper Functions:**
- `hasPermission(role, permission)` - Check if role has permission
- `hasAnyPermission(role, permissions)` - Check if role has any permission
- `hasAllPermissions(role, permissions)` - Check if role has all permissions
- `getCurrentUser(context)` - Get current authenticated user
- `isResourceOwner(context, ownerId)` - Check if user owns resource
- `isAdmin(context)` - Check if user is admin
- `isStudent(context)` - Check if user is student

### 3. Authentication API Endpoints (`handlers/auth.ts`)

**POST /api/v1/auth/register**
- Register new user with pending status
- Validates email, phone, password, name, and role
- Phone format: +254XXXXXXXXX (Kenya format)
- Password: minimum 8 characters
- Creates audit log entry
- Returns: userId, email, accountStatus

**POST /api/v1/auth/login**
- Authenticate user with email and password
- Validates account status (must be ACTIVE)
- Updates last login timestamp
- Creates audit log entry
- Returns: user data, accessToken, refreshToken, expiresIn

**POST /api/v1/auth/logout** (Protected)
- Revokes refresh token
- Requires valid access token
- Creates audit log entry
- Returns: success message

**POST /api/v1/auth/refresh-token**
- Refreshes access token using refresh token
- Implements token rotation (old token revoked, new token issued)
- Validates account status
- Returns: new accessToken, new refreshToken, expiresIn

**GET /api/v1/auth/me** (Protected)
- Get current user profile
- Requires valid access token
- Returns: full user data (without password hash)

### 4. Audit Logging (`services/auditService.ts`)

**Features:**
- Immutable audit log entries
- Captures user ID, action, resource type, resource ID, metadata
- Captures IP address and user agent
- Logs all authentication events (login, logout, registration)
- Non-blocking (errors don't break main flow)

**Logged Events:**
- `USER_CREATED` - User registration
- `USER_LOGIN` - Successful login
- `USER_LOGIN_FAILED` - Failed login attempt
- `USER_LOGOUT` - User logout

## Security Features

### Password Security
- Bcrypt hashing with 12 rounds (meets requirement 15.4)
- Passwords never stored in plain text
- Passwords never returned in API responses

### Token Security
- JWT access tokens with 1-hour expiration (requirement 1.5)
- Refresh tokens with 7-day expiration (requirement 1.5)
- Refresh tokens stored in Cloudflare KV with automatic expiration
- Token rotation on refresh (security best practice)
- Tokens revoked on logout

### Account Security
- User registration requires admin approval (PENDING status)
- Account status validation on login and token refresh
- Failed login attempts logged for audit trail
- IP address and user agent captured for all auth events

### API Security
- All protected endpoints require valid JWT
- Role-based access control enforced
- Permission-based authorization available
- Consistent error responses (no information leakage)

## Error Handling

**Authentication Errors:**
- `UNAUTHORIZED` (401) - Missing or invalid token
- `TOKEN_EXPIRED` (401) - Access token expired
- `INVALID_TOKEN` (401) - Invalid JWT signature
- `INVALID_CREDENTIALS` (401) - Wrong email/password
- `INVALID_REFRESH_TOKEN` (401) - Invalid or expired refresh token

**Authorization Errors:**
- `FORBIDDEN` (403) - Insufficient permissions
- `ACCOUNT_PENDING` (403) - Account awaiting approval
- `ACCOUNT_DEACTIVATED` (403) - Account deactivated
- `ACCOUNT_REJECTED` (403) - Account rejected

**Validation Errors:**
- `VALIDATION_ERROR` (400) - Invalid input data
- `USER_ALREADY_EXISTS` (409) - Email already registered
- `PHONE_ALREADY_EXISTS` (409) - Phone already registered

**Other Errors:**
- `USER_NOT_FOUND` (404) - User not found
- `INTERNAL_SERVER_ERROR` (500) - Unexpected error

## Usage Examples

### Register a New User

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

### Login

```bash
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "SecurePass123!"
  }'
```

### Get Current User Profile

```bash
curl -X GET http://localhost:8787/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"
```

### Refresh Access Token

```bash
curl -X POST http://localhost:8787/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh_token>"
  }'
```

### Logout

```bash
curl -X POST http://localhost:8787/api/v1/auth/logout \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh_token>"
  }'
```

## Environment Variables Required

The following environment variables must be set in Cloudflare Workers:

- `JWT_SECRET` - Secret key for JWT signing (use `wrangler secret put JWT_SECRET`)
- `JWT_EXPIRY` - Access token expiration (default: "3600" seconds)
- `REFRESH_TOKEN_EXPIRY` - Refresh token expiration (default: "604800" seconds)

## Database Tables Used

- `users` - User accounts and credentials
- `audit_logs` - Immutable audit trail

## KV Namespaces Used

- `SESSIONS` - Refresh token storage with automatic expiration

## Requirements Satisfied

- ✅ Requirement 1.1 - User authentication with valid credentials
- ✅ Requirement 1.2 - Reject invalid credentials and log attempts
- ✅ Requirement 1.3 - Role-based access control
- ✅ Requirement 1.4 - Deny unauthorized access
- ✅ Requirement 1.5 - Encrypt authentication tokens
- ✅ Requirement 1.6 - Require re-authentication on session expiry
- ✅ Requirement 2.1 - User registration with pending status
- ✅ Requirement 8.1 - Audit logging for all actions
- ✅ Requirement 8.5 - Log authentication attempts
- ✅ Requirement 15.4 - Bcrypt password hashing with 12 rounds

## Next Steps

The authentication system is now ready for use. Next tasks will implement:
- User management endpoints (approval, deactivation)
- Request submission and workflow
- Document management
- Payment integration

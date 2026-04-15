# Manual Authentication Testing Guide

This guide provides step-by-step instructions to manually test the authentication system.

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

### 1. User Registration

**Test Case: Register a new student**

```bash
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student1@example.com",
    "phone": "+254712345678",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe",
    "role": "STUDENT"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Registration successful. Awaiting admin approval.",
  "data": {
    "userId": "uuid-here",
    "email": "student1@example.com",
    "accountStatus": "PENDING"
  }
}
```

**Test Case: Register with duplicate email**

```bash
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student1@example.com",
    "phone": "+254712345679",
    "password": "SecurePass123!",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "STUDENT"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "USER_ALREADY_EXISTS",
    "message": "A user with this email already exists"
  }
}
```

**Test Case: Register with invalid phone format**

```bash
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student2@example.com",
    "phone": "0712345678",
    "password": "SecurePass123!",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "STUDENT"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [...]
  }
}
```

### 2. User Login

**Note:** Before testing login, you need to manually approve the user in the database:

```bash
npm run db:verify
# Then manually update the user's accountStatus to 'ACTIVE'
```

Or use this SQL command:
```sql
UPDATE users SET account_status = 'ACTIVE' WHERE email = 'student1@example.com';
```

**Test Case: Login with valid credentials**

```bash
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student1@example.com",
    "password": "SecurePass123!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "student1@example.com",
      "role": "STUDENT",
      "firstName": "John",
      "lastName": "Doe",
      "accountStatus": "ACTIVE"
    },
    "accessToken": "jwt-token-here",
    "refreshToken": "uuid-refresh-token",
    "expiresIn": 3600
  }
}
```

**Save the tokens for subsequent tests!**

**Test Case: Login with invalid credentials**

```bash
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student1@example.com",
    "password": "WrongPassword"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**Test Case: Login with pending account**

```bash
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pending-user@example.com",
    "password": "SecurePass123!"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_PENDING",
    "message": "Account is pending. Please contact an administrator."
  }
}
```

### 3. Get Current User Profile

**Test Case: Get profile with valid token**

```bash
curl -X GET http://localhost:8787/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "email": "student1@example.com",
    "phone": "+254712345678",
    "role": "STUDENT",
    "firstName": "John",
    "lastName": "Doe",
    "accountStatus": "ACTIVE",
    "isEmailVerified": false,
    "isPhoneVerified": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "lastLoginAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Test Case: Get profile without token**

```bash
curl -X GET http://localhost:8787/api/v1/auth/me
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid authorization header"
  }
}
```

**Test Case: Get profile with invalid token**

```bash
curl -X GET http://localhost:8787/api/v1/auth/me \
  -H "Authorization: Bearer invalid-token"
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid access token"
  }
}
```

### 4. Refresh Access Token

**Test Case: Refresh with valid refresh token**

```bash
curl -X POST http://localhost:8787/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN_HERE"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "new-jwt-token-here",
    "refreshToken": "new-uuid-refresh-token",
    "expiresIn": 3600
  }
}
```

**Note:** The old refresh token is now invalid (token rotation).

**Test Case: Refresh with invalid token**

```bash
curl -X POST http://localhost:8787/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "invalid-uuid"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Invalid or expired refresh token"
  }
}
```

### 5. Logout

**Test Case: Logout with valid tokens**

```bash
curl -X POST http://localhost:8787/api/v1/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN_HERE"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Test Case: Try to use refresh token after logout**

```bash
curl -X POST http://localhost:8787/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN_HERE"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Invalid or expired refresh token"
  }
}
```

## Verification Checklist

- [ ] User registration creates user with PENDING status
- [ ] Duplicate email registration is rejected
- [ ] Invalid phone format is rejected
- [ ] Login with valid credentials returns tokens
- [ ] Login with invalid credentials is rejected
- [ ] Login with pending account is rejected
- [ ] Access token allows access to protected endpoints
- [ ] Invalid/missing token is rejected
- [ ] Refresh token generates new tokens
- [ ] Old refresh token is invalidated after refresh (token rotation)
- [ ] Logout revokes refresh token
- [ ] Audit logs are created for all auth events

## Database Verification

Check audit logs:
```sql
SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;
```

Check users:
```sql
SELECT id, email, role, account_status, created_at, last_login_at FROM users;
```

## Troubleshooting

**Issue: "JWT_SECRET not configured"**
- Solution: Set the JWT_SECRET environment variable in wrangler.toml or use `wrangler secret put JWT_SECRET`

**Issue: "Database not found"**
- Solution: Run `npm run db:init` to initialize the database

**Issue: "Cannot login - account pending"**
- Solution: Manually update the user's account_status to 'ACTIVE' in the database

**Issue: "CORS error in browser"**
- Solution: The CORS middleware is configured for localhost:3000 and localhost:3001. Add your frontend URL if different.

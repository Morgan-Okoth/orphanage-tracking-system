# API Documentation

Base URL: `https://financial-transparency-api.your-subdomain.workers.dev`

All authenticated endpoints require: `Authorization: Bearer <access_token>`

All responses follow the shape:
```json
{ "success": true, "data": {}, "message": "..." }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

---

## Authentication

### POST /api/v1/auth/register
Register a new user (account starts as PENDING, requires admin approval).

**Body:**
```json
{
  "email": "student@example.com",
  "phone": "+254712345678",
  "password": "SecurePass123!",
  "firstName": "Jane",
  "lastName": "Doe",
  "role": "STUDENT"
}
```
Roles: `STUDENT` | `ADMIN_LEVEL_1` | `ADMIN_LEVEL_2`

**Response 201:**
```json
{
  "success": true,
  "message": "Registration successful. Awaiting admin approval.",
  "data": { "userId": "uuid", "email": "...", "accountStatus": "PENDING" }
}
```

---

### POST /api/v1/auth/login
```json
{ "email": "student@example.com", "password": "SecurePass123!" }
```
**Response 200:**
```json
{
  "data": {
    "user": { "id": "uuid", "email": "...", "role": "STUDENT", "firstName": "Jane", "lastName": "Doe" },
    "accessToken": "jwt...",
    "refreshToken": "uuid",
    "expiresIn": 3600
  }
}
```

---

### POST /api/v1/auth/refresh-token
```json
{ "refreshToken": "uuid" }
```

### POST /api/v1/auth/logout *(auth required)*
```json
{ "refreshToken": "uuid" }
```

### GET /api/v1/auth/me *(auth required)*
Returns current user profile.

---

## Users

### GET /api/v1/users *(admin)*
Query params: `role`, `accountStatus`, `page`, `limit`

### GET /api/v1/users/pending *(ADMIN_LEVEL_1)*
Returns users with `accountStatus: PENDING`.

### GET /api/v1/users/:id *(auth)*
Students can only fetch their own profile.

### PATCH /api/v1/users/:id *(auth)*
```json
{ "firstName": "Jane", "lastName": "Doe", "phone": "+254712345678" }
```

### POST /api/v1/users/:id/approve *(admin)*
Activates a PENDING account and notifies the user.

### POST /api/v1/users/:id/reject *(admin)*
```json
{ "reason": "Incomplete information provided." }
```

### DELETE /api/v1/users/:id *(admin)*
Soft-deactivates the account. Historical data is preserved.

### POST /api/v1/users/:id/reactivate *(admin)*
Restores a DEACTIVATED account.

---

## Financial Requests

### POST /api/v1/requests *(STUDENT)*
Multipart form data:
- `type`: `SCHOOL_FEES` | `MEDICAL_EXPENSES` | `SUPPLIES` | `EMERGENCY` | `OTHER`
- `amount`: positive number, max 2 decimal places, max 1,000,000
- `reason`: 10–1000 characters
- `document0`, `document1`, ...: PDF/JPG/PNG/JPEG files, max 10MB each

**Response 201:** Request with `status: SUBMITTED` and uploaded document metadata.

### GET /api/v1/requests *(auth)*
Query params: `status`, `page`, `limit`
- Students see only their own requests
- Admins see all requests

### GET /api/v1/requests/:id *(auth)*

### PATCH /api/v1/requests/:id *(STUDENT)*
Only allowed when `status: SUBMITTED`. Updates `type`, `amount`, `reason`.

### DELETE /api/v1/requests/:id *(STUDENT)*
Soft-deletes (archives) a SUBMITTED request.

### GET /api/v1/requests/:id/history *(auth)*
Returns status change history with timestamps and actors.

### GET /api/v1/requests/archived *(admin)*
Query params: `dateFrom`, `dateTo`, `studentId`, `minAmount`, `maxAmount`, `page`, `limit`

### GET /api/v1/requests/archived/:id *(auth)*
Returns full archived request with documents, comments, and status history.

---

## Request Workflow

### POST /api/v1/requests/:id/review *(ADMIN_LEVEL_1)*
Transitions: `SUBMITTED → UNDER_REVIEW`

### POST /api/v1/requests/:id/approve *(ADMIN_LEVEL_1)*
Transitions: `UNDER_REVIEW → APPROVED`
```json
{ "comment": "All documents verified." }
```

### POST /api/v1/requests/:id/reject *(ADMIN_LEVEL_1 | ADMIN_LEVEL_2)*
```json
{ "reason": "Insufficient documentation." }
```

### POST /api/v1/requests/:id/request-docs *(ADMIN_LEVEL_1)*
Transitions: `UNDER_REVIEW → PENDING_DOCUMENTS`
```json
{ "reason": "Please provide a fee structure document." }
```

### POST /api/v1/requests/:id/verify *(ADMIN_LEVEL_2)*
Transitions: `APPROVED → VERIFIED`

### POST /api/v1/requests/:id/flag *(ADMIN_LEVEL_2)*
Transitions: `APPROVED | VERIFIED → FLAGGED`
```json
{ "reason": "Amount inconsistent with previous requests." }
```

---

## Comments

### POST /api/v1/requests/:id/comments *(auth)*
```json
{ "content": "Please resubmit with clearer documents.", "isInternal": false }
```
`isInternal: true` is only visible to admins.

### GET /api/v1/requests/:id/comments *(auth)*
Students see only non-internal comments.

---

## Documents

### POST /api/v1/documents *(auth)*
Multipart: `file` + `requestId`

### GET /api/v1/documents/:id *(auth)*
Returns document metadata.

### GET /api/v1/documents/:id/download *(auth)*
Returns a pre-signed R2 URL (5-minute expiry).

### GET /api/v1/requests/:id/documents *(auth)*

---

## Payments

### POST /api/v1/payments/initiate *(ADMIN_LEVEL_1)*
Request must be in `VERIFIED` status.
```json
{ "requestId": "uuid", "phoneNumber": "+254712345678", "amount": 15000 }
```
**Response:**
```json
{
  "data": {
    "transactionId": "uuid",
    "mpesaCheckoutRequestId": "ws_CO_...",
    "status": "pending",
    "amount": 15000
  }
}
```

### POST /api/v1/payments/webhook *(public)*
M-Pesa STK Push callback. Verifies payment and transitions request to `PAID`.

### GET /api/v1/payments/:id *(auth)*
### GET /api/v1/payments/request/:requestId *(auth)*
### GET /api/v1/payments *(admin)*
Query params: `page`, `limit`

---

## Notifications

### GET /api/v1/notifications *(auth)*
### GET /api/v1/notifications/unread-count *(auth)*
### PATCH /api/v1/notifications/:id/read *(auth)*
### PATCH /api/v1/notifications/read-all *(auth)*

---

## Admin Dashboard

### GET /api/v1/admin/dashboard *(ADMIN_LEVEL_1)*
Returns request counts by status, total disbursed this month, pending actions.

### GET /api/v1/admin/auditor-dashboard *(ADMIN_LEVEL_2)*
Returns flagged cases, recent audit entries, anomaly results.

---

## Audit Logs

### GET /api/v1/audit-logs *(ADMIN_LEVEL_2)*
Query params: `userId`, `action`, `startDate`, `endDate`, `page`, `limit`

---

## Reports

### GET /api/v1/reports/monthly *(ADMIN_LEVEL_2)*
Query params: `month` (e.g. `2024-03`)

### GET /api/v1/reports/anomalies *(ADMIN_LEVEL_2)*
### POST /api/v1/reports/generate *(ADMIN_LEVEL_2)*
### GET /api/v1/reports/:id/download *(ADMIN_LEVEL_2)*

---

## Public Transparency (no auth)

### GET /api/v1/public/statistics
### GET /api/v1/public/statistics/monthly
### GET /api/v1/public/statistics/by-type
### GET /api/v1/public/charts/funding

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `TOKEN_EXPIRED` | 401 | Access token has expired |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INVALID_STATUS_TRANSITION` | 400 | Status change not allowed |
| `CANNOT_MODIFY_ARCHIVED_REQUEST` | 400 | Request is archived |
| `REQUEST_NOT_VERIFIED` | 400 | Payment requires VERIFIED status |

---

## Rate Limits

| Client type | Limit |
|-------------|-------|
| Unauthenticated | 100 req / 15 min per IP |
| Authenticated | 1000 req / 15 min per user |

Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

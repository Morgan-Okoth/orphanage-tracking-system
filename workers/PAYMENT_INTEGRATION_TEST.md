# M-Pesa Payment Integration Testing Guide

## Overview
This document provides testing instructions for the M-Pesa payment gateway integration implemented in Task 9.

## Prerequisites

### 1. M-Pesa Daraja API Credentials
You need to obtain credentials from the M-Pesa Daraja API portal:
- Consumer Key
- Consumer Secret
- Business Shortcode
- Passkey
- Callback URL (your deployed worker URL + `/api/v1/payments/webhook`)

### 2. Environment Configuration
Set the following secrets using Wrangler CLI:

```bash
# Set M-Pesa credentials
wrangler secret put MPESA_CONSUMER_KEY
wrangler secret put MPESA_CONSUMER_SECRET
wrangler secret put MPESA_SHORTCODE
wrangler secret put MPESA_PASSKEY
wrangler secret put MPESA_CALLBACK_URL
```

## Testing Scenarios

### Scenario 1: Initiate Payment for Verified Request

**Prerequisites:**
- A request with status `VERIFIED`
- Admin Level 1 authentication token

**Request:**
```bash
curl -X POST https://your-worker-url.workers.dev/api/v1/payments/initiate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "uuid-of-verified-request",
    "phoneNumber": "+254712345678",
    "amount": 15000.00
  }'
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Payment initiated successfully",
  "data": {
    "transactionId": "uuid",
    "mpesaCheckoutRequestId": "ws_CO_123456789",
    "status": "pending",
    "amount": 15000.00,
    "message": "The service request is processed successfully."
  }
}
```

**Validation:**
- Transaction record created in database with status `pending`
- M-Pesa STK Push sent to the phone number
- Audit log entry created with action `PAYMENT_INITIATED`

### Scenario 2: M-Pesa Callback - Successful Payment

**Request (from M-Pesa):**
```bash
curl -X POST https://your-worker-url.workers.dev/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "MerchantRequestID": "29115-34620561-1",
        "CheckoutRequestID": "ws_CO_191220191020363925",
        "ResultCode": 0,
        "ResultDesc": "The service request is processed successfully.",
        "CallbackMetadata": {
          "Item": [
            {
              "Name": "Amount",
              "Value": 15000
            },
            {
              "Name": "MpesaReceiptNumber",
              "Value": "NLJ7RT61SV"
            },
            {
              "Name": "TransactionDate",
              "Value": 20191219102115
            },
            {
              "Name": "PhoneNumber",
              "Value": 254712345678
            }
          ]
        }
      }
    }
  }'
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Callback processed successfully"
}
```

**Validation:**
- Transaction status updated to `completed`
- M-Pesa receipt number stored
- Request status updated to `PAID`
- Payment confirmation email queued for student
- Payment confirmation SMS queued for student
- Audit log entry created with action `PAYMENT_COMPLETED`

### Scenario 3: M-Pesa Callback - Failed Payment

**Request (from M-Pesa):**
```bash
curl -X POST https://your-worker-url.workers.dev/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "MerchantRequestID": "29115-34620561-1",
        "CheckoutRequestID": "ws_CO_191220191020363925",
        "ResultCode": 1032,
        "ResultDesc": "Request cancelled by user"
      }
    }
  }'
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Callback processed successfully"
}
```

**Validation:**
- Transaction status updated to `failed`
- Failure reason stored: "Request cancelled by user"
- Request status remains `VERIFIED` (not updated to PAID)
- Audit log entry created with action `PAYMENT_FAILED`

### Scenario 4: Get Payment Details

**Request:**
```bash
curl -X GET https://your-worker-url.workers.dev/api/v1/payments/{transactionId} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "requestId": "uuid",
    "amount": 15000.00,
    "currency": "KES",
    "mpesaTransactionId": "ws_CO_191220191020363925",
    "mpesaReceiptNumber": "NLJ7RT61SV",
    "phoneNumber": "+254712345678",
    "status": "completed",
    "initiatedAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:32:00Z",
    "failureReason": null
  }
}
```

### Scenario 5: Get Payment by Request ID

**Request:**
```bash
curl -X GET https://your-worker-url.workers.dev/api/v1/payments/request/{requestId} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "requestId": "uuid",
    "amount": 15000.00,
    "currency": "KES",
    "mpesaTransactionId": "ws_CO_191220191020363925",
    "mpesaReceiptNumber": "NLJ7RT61SV",
    "phoneNumber": "+254712345678",
    "status": "completed",
    "initiatedAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:32:00Z",
    "failureReason": null
  }
}
```

### Scenario 6: List All Payments (Admin Only)

**Request:**
```bash
curl -X GET "https://your-worker-url.workers.dev/api/v1/payments?page=1&limit=50" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "requestId": "uuid",
        "amount": 15000.00,
        "currency": "KES",
        "mpesaTransactionId": "ws_CO_191220191020363925",
        "mpesaReceiptNumber": "NLJ7RT61SV",
        "phoneNumber": "+254712345678",
        "status": "completed",
        "initiatedAt": "2024-01-15T10:30:00Z",
        "completedAt": "2024-01-15T10:32:00Z",
        "failureReason": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

## Error Scenarios

### Error 1: Payment Initiation for Non-Verified Request

**Request:**
```bash
curl -X POST https://your-worker-url.workers.dev/api/v1/payments/initiate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "uuid-of-submitted-request",
    "phoneNumber": "+254712345678",
    "amount": 15000.00
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "REQUEST_NOT_VERIFIED",
    "message": "Request must be verified before payment can be initiated"
  }
}
```

### Error 2: Duplicate Payment Initiation

**Request:**
```bash
curl -X POST https://your-worker-url.workers.dev/api/v1/payments/initiate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "uuid-with-existing-payment",
    "phoneNumber": "+254712345678",
    "amount": 15000.00
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_ALREADY_EXISTS",
    "message": "Payment already exists for this request"
  }
}
```

### Error 3: Invalid Phone Number Format

**Request:**
```bash
curl -X POST https://your-worker-url.workers.dev/api/v1/payments/initiate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "uuid-of-verified-request",
    "phoneNumber": "0712345678",
    "amount": 15000.00
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "path": ["phoneNumber"],
        "message": "Invalid Kenyan phone number"
      }
    ]
  }
}
```

## Audit Trail Verification

After each payment operation, verify the audit logs:

```sql
SELECT * FROM audit_logs 
WHERE action IN ('PAYMENT_INITIATED', 'PAYMENT_COMPLETED', 'PAYMENT_FAILED')
ORDER BY timestamp DESC;
```

Expected audit log entries:
- `PAYMENT_INITIATED` - When payment is initiated by admin
- `PAYMENT_COMPLETED` - When M-Pesa callback confirms successful payment
- `PAYMENT_FAILED` - When M-Pesa callback reports payment failure

## Database Verification

### Check Transaction Records

```sql
SELECT * FROM transactions 
WHERE request_id = 'your-request-id';
```

Expected fields:
- `id` - Transaction UUID
- `request_id` - Associated request UUID
- `amount` - Payment amount
- `currency` - "KES"
- `mpesa_transaction_id` - M-Pesa checkout request ID
- `mpesa_receipt_number` - M-Pesa receipt (after successful payment)
- `phone_number` - Recipient phone number
- `status` - "pending", "completed", or "failed"
- `initiated_at` - Timestamp when payment was initiated
- `completed_at` - Timestamp when payment completed (if successful)
- `failure_reason` - Reason for failure (if failed)
- `metadata` - JSON with additional details

### Check Request Status Update

```sql
SELECT id, status, paid_at 
FROM requests 
WHERE id = 'your-request-id';
```

After successful payment:
- `status` should be "PAID"
- `paid_at` should have a timestamp

## Notification Verification

### Check Notification Queue

```sql
SELECT * FROM notifications 
WHERE user_id = 'student-user-id' 
AND type IN ('email', 'sms')
ORDER BY created_at DESC;
```

Expected notifications after successful payment:
1. Email notification with subject "Payment Confirmed - Bethel Rays of Hope"
2. SMS notification with payment confirmation and M-Pesa receipt

## M-Pesa Sandbox Testing

For testing in the M-Pesa sandbox environment:

1. Use sandbox credentials from Daraja API portal
2. Use test phone numbers provided by Safaricom
3. Test STK Push will appear on the test phone
4. Use test PIN: 1234 (or as provided by Safaricom)

## Production Deployment Checklist

Before deploying to production:

- [ ] M-Pesa production credentials configured
- [ ] Callback URL points to production worker
- [ ] SSL/TLS certificate valid for callback URL
- [ ] Callback URL is publicly accessible
- [ ] M-Pesa IP whitelist configured (if required)
- [ ] Error monitoring and alerting configured
- [ ] Audit logging verified
- [ ] Notification system tested
- [ ] Database backup strategy in place
- [ ] Transaction encryption verified

## Troubleshooting

### Issue: M-Pesa OAuth fails
**Solution:** Verify consumer key and secret are correct. Check M-Pesa API status.

### Issue: STK Push not received
**Solution:** Verify phone number format. Check M-Pesa sandbox/production environment. Verify shortcode and passkey.

### Issue: Callback not received
**Solution:** Verify callback URL is publicly accessible. Check M-Pesa IP whitelist. Review worker logs.

### Issue: Transaction stuck in pending
**Solution:** Check M-Pesa callback logs. Verify callback processing logic. Check database transaction record.

## Support

For M-Pesa API issues:
- Daraja API Portal: https://developer.safaricom.co.ke
- Support Email: apisupport@safaricom.co.ke

For system issues:
- Check Cloudflare Workers logs
- Review audit logs in database
- Check notification queue status

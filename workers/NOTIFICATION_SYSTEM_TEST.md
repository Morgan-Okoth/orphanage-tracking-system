# Notification System Test Guide

## Overview

This document provides testing instructions for the enhanced notification system implemented in Task 10.1.

## Prerequisites

1. **Environment Setup:**
   ```bash
   # Set required environment variables
   export SENDGRID_API_KEY="your_sendgrid_api_key"
   export AT_API_KEY="your_africas_talking_api_key"
   export AT_USERNAME="your_africas_talking_username"
   ```

2. **Database Setup:**
   - Ensure D1 database is running with latest migrations
   - Notifications table should exist with proper schema

3. **Queue Setup:**
   - Cloudflare Queues configured in wrangler.toml
   - Email and SMS queues properly bound

## Test Scenarios

### 1. User Registration Notification

**Test Case 1.1: Register new user**
```bash
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "phone": "+254712345678",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User",
    "role": "STUDENT"
  }'
```

**Expected Results:**
- Status: 201 Created
- User created with PENDING status
- Email notification queued in database
- Email sent to user confirming registration

**Verification:**
```sql
-- Check notification was created
SELECT * FROM notifications WHERE type = 'email' AND channel = 'testuser@example.com';

-- Check notification status
SELECT status, sent_at, failure_reason FROM notifications WHERE user_id = 'USER_ID';
```

### 2. Request Status Change Notifications

**Test Case 2.1: Submit new request**
```bash
# First login to get JWT token
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!"
  }'

# Submit request
curl -X POST http://localhost:8787/api/v1/requests \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "SCHOOL_FEES",
    "amount": 15000,
    "reason": "Tuition payment for Term 2, 2024"
  }'
```

**Expected Results:**
- Request created with SUBMITTED status
- Email notification sent to student
- Email notification sent to Admin Level 1
- Both notifications logged in database

**Test Case 2.2: Approve request (Admin Level 1)**
```bash
curl -X POST http://localhost:8787/api/v1/requests/REQUEST_ID/approve \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "comment": "Request approved. All documents verified."
  }'
```

**Expected Results:**
- Request status changed to APPROVED
- Email notification sent to student
- SMS notification sent to student
- Email notification sent to Admin Level 2 for verification

### 3. Payment Confirmation Notifications

**Test Case 3.1: Complete payment**
```bash
# Initiate payment (Admin Level 1)
curl -X POST http://localhost:8787/api/v1/payments/initiate \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "REQUEST_ID",
    "phoneNumber": "+254712345678",
    "amount": 15000
  }'

# Simulate M-Pesa callback (successful payment)
curl -X POST http://localhost:8787/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "CheckoutRequestID": "ws_CO_123456789",
        "ResultCode": 0,
        "ResultDesc": "The service request is processed successfully.",
        "CallbackMetadata": {
          "Item": [
            {
              "Name": "MpesaReceiptNumber",
              "Value": "NLJ7RT61SV"
            }
          ]
        }
      }
    }
  }'
```

**Expected Results:**
- Request status changed to PAID
- Email notification sent with payment details
- SMS notification sent with M-Pesa receipt
- Transaction record updated

### 4. Notification Management API

**Test Case 4.1: Get user notifications**
```bash
curl -X GET http://localhost:8787/api/v1/notifications \
  -H "Authorization: Bearer USER_JWT_TOKEN"
```

**Expected Results:**
- List of user's notifications with pagination
- Proper status for each notification (sent/failed/pending)

**Test Case 4.2: Get unread count**
```bash
curl -X GET http://localhost:8787/api/v1/notifications/unread-count \
  -H "Authorization: Bearer USER_JWT_TOKEN"
```

**Expected Results:**
- Count of pending and failed notifications

**Test Case 4.3: Get notification statistics**
```bash
curl -X GET http://localhost:8787/api/v1/notifications/stats \
  -H "Authorization: Bearer USER_JWT_TOKEN"
```

**Expected Results:**
- Statistics broken down by status and type

### 5. Queue Processing Verification

**Test Case 5.1: Monitor queue processing**
```bash
# Check Cloudflare Workers logs
wrangler tail --format=pretty

# Check database for notification status updates
SELECT 
  id, 
  type, 
  status, 
  retry_count, 
  created_at, 
  sent_at, 
  failure_reason 
FROM notifications 
ORDER BY created_at DESC 
LIMIT 10;
```

**Expected Results:**
- Queue messages processed successfully
- Database status updated from 'pending' to 'sent'
- No excessive retry attempts

### 6. Error Handling Tests

**Test Case 6.1: Invalid email address**
```bash
# Register with invalid email
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "phone": "+254712345678",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User",
    "role": "STUDENT"
  }'
```

**Expected Results:**
- Registration fails with validation error
- No notification queued

**Test Case 6.2: SendGrid API failure simulation**
```bash
# Temporarily set invalid SendGrid API key
export SENDGRID_API_KEY="invalid_key"

# Trigger notification
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "phone": "+254712345679",
    "password": "TestPass123!",
    "firstName": "Test2",
    "lastName": "User2",
    "role": "STUDENT"
  }'
```

**Expected Results:**
- Notification queued in database
- Queue consumer attempts to send email
- Failure logged with retry count
- After max retries, marked as failed

### 7. Performance Tests

**Test Case 7.1: Batch notification processing**
```bash
# Create multiple users rapidly to test batch processing
for i in {1..10}; do
  curl -X POST http://localhost:8787/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"user${i}@example.com\",
      \"phone\": \"+25471234567${i}\",
      \"password\": \"TestPass123!\",
      \"firstName\": \"User${i}\",
      \"lastName\": \"Test\",
      \"role\": \"STUDENT\"
    }" &
done
wait
```

**Expected Results:**
- All notifications queued successfully
- Batch processing handles multiple messages efficiently
- No message loss or duplication

## Verification Checklist

### Database Verification
- [ ] Notifications table populated correctly
- [ ] Status transitions logged properly
- [ ] Retry counts incremented on failures
- [ ] Metadata stored for successful sends

### Email Verification
- [ ] Registration confirmation emails received
- [ ] Request status change emails received
- [ ] Payment confirmation emails received
- [ ] HTML formatting displays correctly
- [ ] Email content is personalized

### SMS Verification
- [ ] SMS notifications received for critical events
- [ ] Message content is concise and clear
- [ ] Phone number formatting handled correctly
- [ ] Africa's Talking API responses logged

### Queue Verification
- [ ] Messages processed in batches
- [ ] Failed messages retried appropriately
- [ ] Dead letter queue receives permanently failed messages
- [ ] Queue health check functions work

### API Verification
- [ ] Notification endpoints return correct data
- [ ] Pagination works properly
- [ ] Authorization prevents access to other users' notifications
- [ ] Statistics calculations are accurate

## Troubleshooting

### Common Issues

1. **Notifications not sending:**
   - Check API keys are set correctly
   - Verify queue bindings in wrangler.toml
   - Check Cloudflare Workers logs for errors

2. **Database connection issues:**
   - Verify D1 database binding
   - Check database schema is up to date
   - Ensure proper permissions

3. **Queue processing failures:**
   - Check queue consumer configuration
   - Verify batch size and timeout settings
   - Monitor dead letter queue

### Debug Commands

```bash
# Check queue status
wrangler queues list

# View recent logs
wrangler tail --format=pretty

# Check database content
wrangler d1 execute financial-transparency-db --command="SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5;"

# Test queue health
curl -X GET http://localhost:8787/api/v1/health
```

## Success Criteria

The notification system is working correctly when:

1. ✅ All user registration notifications are sent and received
2. ✅ Request status change notifications work for all status transitions
3. ✅ Payment confirmation notifications include M-Pesa receipt details
4. ✅ Admin notifications are sent to appropriate roles
5. ✅ Queue processing handles batches efficiently
6. ✅ Failed notifications are retried appropriately
7. ✅ Notification management API returns accurate data
8. ✅ Error handling prevents system crashes
9. ✅ Performance is acceptable under load
10. ✅ All notifications are logged in database for audit trail

## Conclusion

This test suite verifies that the enhanced notification system meets all requirements specified in Task 10.1:

- ✅ Cloudflare Queue integration for reliable message processing
- ✅ Email and SMS notification support
- ✅ Comprehensive notification templates
- ✅ Robust error handling and retry logic
- ✅ User-friendly notification management API
- ✅ Proper security and access control
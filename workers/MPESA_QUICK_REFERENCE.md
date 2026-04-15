# M-Pesa Payment Integration - Quick Reference

## Environment Setup

```bash
# Set M-Pesa credentials (production)
wrangler secret put MPESA_CONSUMER_KEY
wrangler secret put MPESA_CONSUMER_SECRET
wrangler secret put MPESA_SHORTCODE
wrangler secret put MPESA_PASSKEY
wrangler secret put MPESA_CALLBACK_URL
```

## API Endpoints

### 1. Initiate Payment
```bash
POST /api/v1/payments/initiate
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "requestId": "uuid",
  "phoneNumber": "+254712345678",
  "amount": 15000.00
}
```

### 2. M-Pesa Webhook (Public)
```bash
POST /api/v1/payments/webhook
Content-Type: application/json

# M-Pesa sends callback data automatically
```

### 3. Get Payment by ID
```bash
GET /api/v1/payments/{transactionId}
Authorization: Bearer <token>
```

### 4. Get Payment by Request ID
```bash
GET /api/v1/payments/request/{requestId}
Authorization: Bearer <token>
```

### 5. List All Payments
```bash
GET /api/v1/payments?page=1&limit=50
Authorization: Bearer <admin_token>
```

## Payment Flow

1. **Admin initiates payment** → Transaction created (status: pending)
2. **M-Pesa sends STK Push** → Student receives prompt on phone
3. **Student enters PIN** → M-Pesa processes payment
4. **M-Pesa sends callback** → System updates transaction
5. **If successful** → Request status → PAID, notifications sent
6. **If failed** → Transaction marked failed, request stays VERIFIED

## Status Values

### Transaction Status
- `pending` - Payment initiated, awaiting M-Pesa response
- `completed` - Payment successful
- `failed` - Payment failed

### Request Status Flow
- `VERIFIED` → (payment initiated) → `PAID` (on success)

## Phone Number Format

**Accepted formats:**
- `+254712345678` ✅
- `254712345678` ✅
- `0712345678` ❌ (will be converted to 254712345678)

## M-Pesa Result Codes

- `0` - Success
- `1032` - Request cancelled by user
- `1037` - Timeout (user didn't enter PIN)
- `2001` - Invalid initiator information
- Other codes - Various errors (see M-Pesa documentation)

## Database Queries

### Check transaction status
```sql
SELECT * FROM transactions WHERE request_id = 'uuid';
```

### Check payment audit logs
```sql
SELECT * FROM audit_logs 
WHERE action IN ('PAYMENT_INITIATED', 'PAYMENT_COMPLETED', 'PAYMENT_FAILED')
ORDER BY timestamp DESC;
```

### Check notifications
```sql
SELECT * FROM notifications 
WHERE user_id = 'uuid' 
AND type IN ('email', 'sms')
ORDER BY created_at DESC;
```

## Error Codes

| Code | Message | Solution |
|------|---------|----------|
| `REQUEST_NOT_FOUND` | Request not found | Verify request ID exists |
| `REQUEST_NOT_VERIFIED` | Request not verified | Request must be VERIFIED status |
| `PAYMENT_ALREADY_EXISTS` | Payment exists | Cannot initiate duplicate payment |
| `STUDENT_NOT_FOUND` | Student not found | Verify student ID |
| `VALIDATION_ERROR` | Invalid data | Check request format |
| `PAYMENT_INITIATION_FAILED` | M-Pesa error | Check M-Pesa credentials/status |

## Testing Checklist

- [ ] M-Pesa sandbox credentials configured
- [ ] Test payment initiation
- [ ] Test successful callback
- [ ] Test failed callback
- [ ] Verify transaction records
- [ ] Verify request status updates
- [ ] Verify audit logs
- [ ] Verify notifications queued
- [ ] Test error scenarios
- [ ] Test pagination

## Monitoring

### Key Metrics to Monitor
- Payment success rate
- Average payment processing time
- Failed payment reasons
- Callback response time
- Transaction volume

### Logs to Check
- M-Pesa API errors
- Callback processing errors
- Transaction creation failures
- Notification queue failures

## Troubleshooting

### STK Push not received
1. Check phone number format
2. Verify M-Pesa credentials
3. Check sandbox vs production environment
4. Verify shortcode and passkey

### Callback not processed
1. Check callback URL is publicly accessible
2. Verify SSL certificate
3. Check worker logs for errors
4. Verify transaction exists in database

### Payment stuck in pending
1. Check M-Pesa callback logs
2. Verify callback URL configuration
3. Check for callback processing errors
4. Contact M-Pesa support if needed

## Support Resources

- **M-Pesa Daraja Portal:** https://developer.safaricom.co.ke
- **API Documentation:** https://developer.safaricom.co.ke/docs
- **Support Email:** apisupport@safaricom.co.ke
- **Test Credentials:** Available in Daraja portal sandbox

## Security Notes

- Never commit M-Pesa credentials to version control
- Use Cloudflare secrets for all sensitive values
- Webhook endpoint is public (no auth required for M-Pesa)
- All payment operations are audit logged
- Transaction records encrypted at rest

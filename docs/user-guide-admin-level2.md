# Admin Level 2 (Auditor) User Guide

## Dashboard Overview

Your dashboard shows:
- **Flagged Cases**: Requests requiring your immediate attention
- **Verification Queue**: Approved requests awaiting your verification
- **Recent Audit Activity**: Latest system actions
- **Anomaly Alerts**: Automatically detected suspicious patterns

---

## Verifying Requests

Requests reach you after Admin Level 1 approves them (status: **Approved**).

### Verifying a Request

1. Open an **Approved** request from your dashboard.
2. Review all documents, the request history, and any admin comments.
3. Click **Verify** — the request moves to **Verified** and payment can be initiated.

### Flagging a Request

If something looks suspicious:
1. Click **Flag**.
2. Enter a detailed reason for flagging.
3. The request moves to **Flagged**, Admin Level 1 is notified, and payment is blocked.

### Adding Audit Notes

You can add internal audit notes to any request at any time. These notes are timestamped and stored permanently in the audit log.

---

## Anomaly Detection

The system automatically flags:
- **Repeated requests**: A student submitting more than 3 requests within 30 days
- **Amount outliers**: Requests with amounts more than 3 standard deviations above the mean for that request type

Review flagged anomalies from **Reports → Anomalies**.

---

## Audit Logs

The audit log records every action in the system — logins, status changes, document access, payments.

### Querying Audit Logs

Go to **Audit Logs** and filter by:
- **User**: Search by user ID or email
- **Action**: e.g. `REQUEST_STATUS_CHANGED`, `PAYMENT_COMPLETED`
- **Date range**: From / To

Results are paginated (50 per page). Audit logs are immutable — they cannot be edited or deleted.

---

## Reports

### Monthly Report

1. Go to **Reports → Monthly**.
2. Select the month.
3. The report includes:
   - Total requests, approvals, rejections
   - Total disbursed funds
   - Breakdown by request type
   - AI-generated narrative summary
   - Detected anomalies

### Exporting Reports

Reports can be exported as **PDF** or **CSV** from the report detail page.

---

## Frequently Asked Questions

**Can I reject a verified request?**
Yes — you can reject a request at any stage from Approved onwards.

**Are audit logs tamper-proof?**
Yes. Audit log entries are immutable — they cannot be modified or deleted by any user.

**How long are records retained?**
All financial records are retained for a minimum of 7 years. Archived requests remain fully accessible and searchable.

**What does the AI summary contain?**
The AI generates a plain-language summary of monthly financial activity, highlighting trends, anomalies, and key statistics. It does not make decisions — it is for informational purposes only.

# Admin Level 1 (Operations) User Guide

## Dashboard Overview

When you log in, your dashboard shows:
- **Pending Actions**: Requests requiring your attention, sorted oldest first
- **Request Counts**: Breakdown by status (Submitted, Under Review, Approved, etc.)
- **Monthly Disbursements**: Total funds disbursed this month

---

## Managing User Accounts

### Approving New Registrations

1. Go to **Users → Pending Approvals**.
2. Review the applicant's details.
3. Click **Approve** to activate the account — the user will be notified by email.
4. Click **Reject** and provide a reason if the registration is invalid.

### Deactivating a User

1. Go to **Users** and find the user.
2. Click **Deactivate**. The user's login is disabled but all their data is preserved.
3. To restore access, click **Reactivate**.

---

## Reviewing Financial Requests

### Starting a Review

1. From the dashboard, click on a request with status **Submitted**.
2. The status automatically changes to **Under Review**.
3. Review the request details, reason, and all attached documents.

### Approving a Request

1. After reviewing, click **Approve**.
2. Optionally add a comment.
3. The request moves to **Approved** and Admin Level 2 is notified for verification.

### Rejecting a Request

1. Click **Reject**.
2. Enter a clear rejection reason — this will be sent to the student.
3. The request moves to **Rejected**.

### Requesting Additional Documents

1. Click **Request Documents**.
2. Specify exactly what documents are needed.
3. The student is notified and the request moves to **Pending Documents**.
4. When the student uploads documents, the request returns to **Under Review**.

---

## Initiating Payments

Payments can only be initiated for requests with status **Verified** (approved by you and verified by Admin Level 2).

1. Open a **Verified** request.
2. Click **Initiate Payment**.
3. Confirm the recipient phone number and amount.
4. Click **Initiate Payout** — an IntaSend payout request is created for the student.
5. IntaSend processes the payout through the configured mobile-money channel.
6. The request status updates to **Paid** automatically.

If payment fails, you will be notified and can retry.

---

## Adding Comments

Use the comment thread on any request to communicate with the student or leave internal notes:
- **Public comments** are visible to the student.
- **Internal comments** are only visible to administrators.

---

## Frequently Asked Questions

**Can I approve a request that is still Under Review?**
Yes — click Approve at any point during the review.

**What happens if I accidentally reject a request?**
The student can submit a new request. There is no way to undo a rejection, so always provide a clear reason.

**Can I see archived requests?**
Yes — go to **Requests → Archived** to search historical requests by date, student, or amount.

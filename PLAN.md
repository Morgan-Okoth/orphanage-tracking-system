# System Remediation Plan

## Objective

Stabilize the orphanage tracking system as a coherent production application by aligning the live frontend, live backend, payment integration, infrastructure setup, data model, and documentation.

The current system is deployed, but it still contains contract drift, provider-specific legacy naming, stale tests/docs, and incomplete operational verification. This plan converts the project from "working in parts" to "operationally reliable".

## Current State Summary

- Frontend is live on Vercel.
- Backend is live on Cloudflare Workers.
- Production auth, CORS, and seeded dashboard access are working.
- Email provider is Resend.
- Payment provider runtime has been switched to IntaSend.
- Cloudflare infrastructure exists for Workers, D1, KV, R2, and Queues.
- `SUPERADMIN` exists in the live schema and application code.
- Public registration is beneficiary-only and login now routes users to the correct dashboard automatically.
- Core app flows exist, but there is still technical drift across code, docs, and tests.

## Workstreams

### 0. Product and Access Model Redesign

Goal: correct the core product assumptions before deeper implementation work continues.

Tasks:
- Refine the final role model now that `SUPERADMIN` has been introduced.
- Decide which roles are system-managed versus user-selectable.
- Keep public self-registration limited to beneficiaries and internalize privileged-role assignment.
- Define who can create, approve, assign, deactivate, and elevate users.
- Clarify whether the app is:
  - beneficiary-facing only
  - staff-facing plus beneficiary-facing
  - donor/public-facing as well
- Define where donation flow belongs:
  - public landing page
  - dedicated donor page
  - external hosted donation provider
  - embedded payment flow

Deliverable:
- Approved role matrix and user-journey model that matches the live access model and future governance needs.

### 1. Payment Domain Cleanup

Goal: remove legacy M-Pesa assumptions and make the payment layer internally consistent.

Tasks:
- Replace legacy `mpesa*` naming in backend return types, DTOs, and UI state.
- Decide on final naming strategy:
  - provider-neutral, e.g. `providerTransactionId`, `providerReference`
  - or IntaSend-specific, e.g. `intasendTrackingId`
- Review webhook handling against actual IntaSend payloads and status transitions.
- Normalize payment lifecycle states:
  - `pending`
  - `processing`
  - `completed`
  - `failed`
  - `under_review` if needed
- Update notification copy to match IntaSend language.

Deliverable:
- Clean payment API contract and payment-state model used consistently across backend and frontend.

### 2. Data Model and Migration Review

Goal: ensure persistence matches the new provider model without long-term confusion.

Tasks:
- Review the `transactions` schema for provider-specific fields.
- Plan whether to:
  - keep current columns and reinterpret them temporarily, or
  - migrate to provider-neutral names.
- If migration is needed:
  - create a safe D1 migration
  - document backward compatibility
  - update seed data if necessary
- Audit any analytics, reporting, or notification code that depends on old transaction fields.

Deliverable:
- Stable transaction schema with an explicit migration strategy.

### 3. Frontend/Backend Contract Audit

Goal: eliminate API shape mismatches and UI assumptions.

Tasks:
- Review all frontend API clients against worker handlers.
- Verify auth request/response contracts.
- Verify request creation, request detail, document list/upload/download, admin review, and payment initiation flows.
- Check all dashboard pages that consume typed API data.
- Remove stale assumptions from components, tests, and hooks.

Deliverable:
- Frontend clients and backend handlers aligned field-for-field.

### 4. Role-Based UX and Navigation

Goal: make the interface reflect the logged-in user’s actual responsibilities and hide irrelevant actions.

Tasks:
- Route users to the correct dashboard automatically after login.
- Ensure the dashboard only shows actions relevant to the authenticated role.
- Review menu/sidebar visibility rules for each role.
- Add explicit handling for the future `SUPERADMIN` role if adopted.
- Remove any UI that suggests a user can choose their own privileged access level.
- Verify unauthorized routes redirect cleanly.

Deliverable:
- Predictable role-aware navigation and dashboards.

### 5. Public Landing and Donor Journey

Goal: make the public-facing site intentional, credible, and useful to both beneficiaries and well-wishers.

Tasks:
- Redesign the root page as a true public homepage instead of a simple app entry page.
- Clarify who the homepage is for:
  - students / beneficiaries
  - administrators
  - auditors
  - donors / well-wishers
- Add a clear donor journey:
  - donate now CTA
  - transparency dashboard CTA
  - program/about content
  - trust and accountability messaging
- Decide where donations are processed:
  - IntaSend collection flow
  - hosted donation page
  - external processor link
- Ensure the public site has a coherent visual direction and not just utility copy.

Deliverable:
- A purposeful public homepage with a real donor entry path.

### 6. Secrets and Environment Audit

Goal: make production configuration explicit and minimal.

Tasks:
- List all secrets currently required by live backend code.
- Separate secrets into:
  - required now
  - optional
  - legacy / removable
- Verify live Cloudflare secret set matches code expectations.
- Verify frontend environment variables in Vercel.
- Remove dead references to deprecated providers or services.

Deliverable:
- Canonical environment inventory for production.

### 7. Live Flow Verification

Goal: verify real operational behavior, not just code shape.

Tasks:
- Test login on live frontend against live backend.
- Test registration flow.
- Test request creation with document upload.
- Test admin review and verification path.
- Test payment initiation path using a safe test case.
- Test notification queue behavior where feasible.
- Verify public transparency page against live backend responses.

Deliverable:
- Short live validation report with pass/fail status per critical flow.

### 8. Documentation Repair

Goal: make operator and deployment docs reflect reality.

Tasks:
- Update deployment documentation for:
  - Vercel frontend
  - Cloudflare backend
  - Resend
  - IntaSend
- Update admin and student user guides for actual payout behavior.
- Remove stale M-Pesa and SendGrid instructions from operator-facing docs.
- Produce a canonical production setup checklist.

Deliverable:
- Accurate deployment and operator documentation.

### 9. Test and Build Health

Goal: get the repository into a maintainable CI-ready state.

Tasks:
- Identify stale tests that still target old providers or contracts.
- Update or remove obsolete payment tests.
- Re-run targeted frontend and backend tests for touched flows.
- Triage existing TypeScript and lint failures by category:
  - pre-existing unrelated issues
  - contract failures
  - provider migration failures
- Reduce reliance on build-time bypasses where practical.

Deliverable:
- Clear test status and a realistic path to green CI.

## Execution Order

### Phase 1. Audit and Stabilization

1. Define the product model and role/access rules
2. Audit payment code and contracts
3. Audit schema and field naming
4. Audit environment and secrets

Output:
- findings list
- approved role and journey assumptions
- naming decision
- migration decision

### Phase 2. Implementation

1. Implement role and registration model changes
2. Clean backend payment model
3. Align frontend payment and request contracts
4. Implement role-aware dashboards and navigation
5. Redesign the landing page and donor path
6. Apply schema or migration updates if needed
7. Repair docs tied directly to changed behavior

Output:
- consistent runtime behavior across frontend and backend

### Phase 3. Verification

1. Run targeted local verification
2. Deploy updated backend/frontend if needed
3. Verify critical live flows

Output:
- live validation results

### Phase 4. Hardening

1. Fix stale tests
2. Reduce ignored build/type gaps
3. Finalize operations checklist

Output:
- maintainable baseline for future work

## Immediate Priorities

These should happen first:

1. Decide and document the final role model, including `SUPERADMIN`.
2. Remove public role self-selection from registration.
3. Define the donor / well-wisher journey from the public homepage.
4. Normalize payment naming and webhook assumptions.
5. Verify that live IntaSend payout initiation works with actual credentials.
6. Audit remaining runtime contract mismatches.

## Definition of Done

The system should be considered stabilized when all of the following are true:

- Payment integration is internally consistent and verified against IntaSend behavior.
- Role and permission model is explicit and enforced.
- Registration and user creation flows match the intended governance model.
- Each role sees only the dashboard actions it should see.
- The public homepage clearly serves both credibility and conversion goals.
- Donors / well-wishers have a real donation path.
- Frontend and backend contracts match on critical flows.
- Production secrets and environment requirements are fully documented.
- Core live flows are tested and confirmed.
- Operator docs reflect the deployed stack.
- The repo has a clear, honest test/build status with known gaps explicitly documented.

## Notes

- Deployment success alone is not sufficient; operational verification is required.
- Provider credentials that were pasted into chat should be rotated after setup.
- Where possible, future naming should be provider-neutral to reduce migration cost later.

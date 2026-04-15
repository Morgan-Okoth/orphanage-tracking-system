# Frontend

Next.js App Router frontend for the Financial Transparency and Accountability System.

## Stack

- Next.js 16
- React 19
- TypeScript
- Material UI
- TanStack Query
- React Hook Form + Zod
- Vitest + Testing Library

## Local Development

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

Set `NEXT_PUBLIC_API_URL` in `.env.local` if the API is not running at the default local worker URL:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8787/api/v1
NEXT_PUBLIC_DONATION_URL=
```

`NEXT_PUBLIC_DONATION_URL` is optional. When set, `/donate` sends well-wishers directly to your live hosted donation flow. When unset, the page falls back to a contact CTA.

## Main Routes

- `/` public landing page
- `/donate` donor and well-wisher page
- `/login` sign-in flow
- `/register` beneficiary self-service registration
- `/student` beneficiary dashboard
- `/admin` admin level 1 dashboard
- `/auditor` admin level 2 dashboard
- `/superadmin` governance dashboard
- `/public-transparency` public-facing transparency dashboard

## Notes

- Auth uses bearer tokens stored in `localStorage`.
- In local development, the app defaults to `http://localhost:8787/api/v1` only when opened from `localhost`. Non-local deployments fall back to the live Workers API.
- Request submission uses multipart form data because the worker requires request details and supporting documents in the same submission.
- Public registration is beneficiary-only. Internal staff and auditor roles are provisioned by governance, not self-selected on the public form.
- Dashboard and request screens assume the Cloudflare Workers API contract defined in `../workers/api/router.ts`.

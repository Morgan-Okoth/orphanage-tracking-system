# Frontend Deployment Guide

This frontend is a Next.js 16 app and can be deployed on Vercel (recommended) or any container platform.

## 1) Required environment variables

Set these before deployment:

```bash
NEXT_PUBLIC_API_URL=https://financial-transparency-api.morgan-ent.workers.dev/api/v1
NEXT_PUBLIC_DONATION_URL=
```

- `NEXT_PUBLIC_API_URL`: Public API base URL for the workers backend.
- `NEXT_PUBLIC_DONATION_URL`: Optional external donation flow URL. Leave empty to use internal donor CTA fallback.

## 2) Recommended: Vercel deployment

1. Import the repository into Vercel.
2. Set project root to `frontend`.
3. Framework preset: Next.js.
4. Add the environment variables above.
5. Deploy from `main` (or your preferred production branch).

Build command:

```bash
npm run build
```

Output:

```bash
.next
```

## 3) Container deployment (Docker)

Build and run:

```bash
docker build -t orphanage-frontend .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=https://financial-transparency-api.morgan-ent.workers.dev/api/v1 \
  orphanage-frontend
```

## 4) Release validation checklist

- `npm run lint` passes
- `npm run build` passes
- Home page loads and routes to `/login`, `/register`, `/public-transparency`, `/donate`
- Authenticated users are routed to the correct dashboards
- Public transparency data loads from production API

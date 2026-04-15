# Deployment Guide

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and authenticated
- Node.js 20+
- A Cloudflare account with Workers, Pages, D1, R2, KV, and Queues enabled

---

## 1. Create Cloudflare Services

Run these commands once to provision all required infrastructure.

### D1 Database
```bash
wrangler d1 create financial-transparency-db
# Copy the database_id into workers/wrangler.toml [env.production]
```

### R2 Buckets
```bash
wrangler r2 bucket create financial-documents-prod
wrangler r2 bucket create financial-backups-prod
```

### KV Namespaces
```bash
wrangler kv namespace create CACHE --env production
wrangler kv namespace create SESSIONS --env production
# Copy the IDs into workers/wrangler.toml [env.production]
```

### Queues
```bash
wrangler queues create email-notifications-prod
wrangler queues create sms-notifications-prod
wrangler queues create email-notifications-prod-dlq
wrangler queues create sms-notifications-prod-dlq
```

---

## 2. Run Database Migrations

```bash
cd workers
wrangler d1 migrations apply financial-transparency-db --env production
```

---

## 3. Set Production Secrets

```bash
cd workers

# Required secrets
wrangler secret put JWT_SECRET --env production
wrangler secret put ENCRYPTION_KEY --env production   # 64-char hex: openssl rand -hex 32

# M-Pesa
wrangler secret put MPESA_CONSUMER_KEY --env production
wrangler secret put MPESA_CONSUMER_SECRET --env production
wrangler secret put MPESA_SHORTCODE --env production
wrangler secret put MPESA_PASSKEY --env production
wrangler secret put MPESA_CALLBACK_URL --env production

# Email (SendGrid)
wrangler secret put SENDGRID_API_KEY --env production

# SMS (Africa's Talking)
wrangler secret put AT_API_KEY --env production
wrangler secret put AT_USERNAME --env production
wrangler secret put AT_SENDER_ID --env production
```

---

## 4. Deploy Cloudflare Workers (Backend)

```bash
cd workers
npm ci
wrangler deploy --env production
```

Verify the deployment:
```bash
curl https://financial-transparency-api.your-subdomain.workers.dev/health
```

---

## 5. Deploy Frontend to Cloudflare Pages

### Option A — GitHub Actions (recommended)

Push to `main` branch. The CI/CD pipeline in `.github/workflows/deploy.yml` will:
1. Run all backend tests
2. Deploy Workers API
3. Build and deploy the Next.js frontend to Cloudflare Pages

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers and Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID
- `NEXT_PUBLIC_API_URL` — Production API URL (e.g. `https://financial-transparency-api.your-subdomain.workers.dev/api/v1`)

### Option B — Manual

```bash
cd frontend
npm ci
NEXT_PUBLIC_API_URL=https://your-api-url/api/v1 npm run build
wrangler pages deploy out --project-name=financial-transparency-frontend
```

---

## 6. Configure Custom Domain (Optional)

In the Cloudflare dashboard:
1. Go to **Workers & Pages** → your project
2. Click **Custom domains** → **Set up a custom domain**
3. Enter your domain and follow the DNS configuration steps

---

## 7. Set Up Monitoring

```bash
# Configure Cloudflare Logpush for Workers logs
wrangler logpush create --env production \
  --destination-conf "r2://financial-backups-prod/logs/{DATE}" \
  --fields "Event,EventTimestampMs,Outcome,Exceptions,Logs"
```

For error tracking, add your Sentry DSN:
```bash
wrangler secret put SENTRY_DSN --env production
```

---

## Verifying the Deployment

```bash
# Health check
curl https://your-api-url/health

# Check backup status
wrangler kv key get --binding CACHE backup:last_success --env production

# Check last archival run
wrangler kv key get --binding CACHE backup:last_failure --env production
```

---

## Rollback

```bash
# List recent deployments
wrangler deployments list --env production

# Roll back to a previous version
wrangler rollback <deployment-id> --env production
```

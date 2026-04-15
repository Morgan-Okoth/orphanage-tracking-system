# Backup and Restoration Procedures

## Backup Schedule

- Daily backups at **2:00 AM UTC** (cron: `0 2 * * *`)
- Stored in R2 bucket: `financial-backups`
- Retention: **30 days** (daily), **12 months / 365 days** (monthly)
- Encryption: **AES-256-GCM** (Web Crypto API)

## Backup Key Format

| Type    | Key Pattern                          | Example                              |
|---------|--------------------------------------|--------------------------------------|
| Daily   | `backups/daily/YYYY-MM-DD.json.enc`  | `backups/daily/2024-03-15.json.enc`  |
| Monthly | `backups/monthly/YYYY-MM.json.enc`   | `backups/monthly/2024-03.json.enc`   |

Monthly backups are created automatically on the **1st of each month** in addition to the daily backup.

## Backup Payload Structure

```json
{
  "version": "1.0",
  "timestamp": "2024-03-15T02:00:00.000Z",
  "tables": {
    "users": [...],
    "requests": [...],
    "documents": [...],
    "transactions": [...],
    "audit_logs": [...],
    "notifications": [...],
    "comments": [...],
    "status_changes": [...],
    "document_access": [...],
    "public_statistics": [...]
  }
}
```

---

## Step-by-Step Restoration

### Prerequisites

- Wrangler CLI installed and authenticated: `wrangler login`
- `ENCRYPTION_KEY` secret available (64-char hex string)
- Access to the `financial-backups` R2 bucket

---

### 1. List Available Backups

```bash
# List daily backups
wrangler r2 object list financial-backups --prefix backups/daily/

# List monthly backups
wrangler r2 object list financial-backups --prefix backups/monthly/
```

Or via the API (requires admin auth):
```
GET /api/admin/backups
```

---

### 2. Download a Backup

```bash
# Download a specific daily backup
wrangler r2 object get financial-backups backups/daily/2024-03-15.json.enc \
  --file ./backup-2024-03-15.json.enc

# Download the latest monthly backup
wrangler r2 object get financial-backups backups/monthly/2024-03.json.enc \
  --file ./backup-2024-03.json.enc
```

---

### 3. Decrypt the Backup

Use the restoration script (see `scripts/restore.ts`):

```bash
# From the workers/ directory
ENCRYPTION_KEY=<your-64-char-hex-key> npx tsx scripts/restore.ts \
  --key backups/daily/2024-03-15.json.enc \
  --output ./restored-2024-03-15.json
```

The script will:
1. Download the encrypted file from R2
2. Decrypt using AES-256-GCM
3. Verify payload integrity (version, timestamp, tables)
4. Write the decrypted JSON to the output file

---

### 4. Restore to D1

**Option A — Re-import JSON via the restore script (generates SQL):**

```bash
npx tsx scripts/restore.ts \
  --key backups/daily/2024-03-15.json.enc \
  --output ./restore.sql \
  --format sql
```

Then apply the SQL:
```bash
# Local D1
wrangler d1 execute financial-transparency-db --local --file ./restore.sql

# Remote D1
wrangler d1 execute financial-transparency-db --file ./restore.sql
```

**Option B — Manual table restore:**

```bash
# Extract a single table from the JSON
cat restored-2024-03-15.json | jq '.tables.users' > users.json

# Use wrangler d1 import (if available) or generate INSERT statements
```

---

### 5. Verify Restoration

After restoring, verify the data:

```bash
# Check row counts match the backup
wrangler d1 execute financial-transparency-db \
  --command "SELECT 'users' as tbl, COUNT(*) as cnt FROM users
             UNION ALL SELECT 'requests', COUNT(*) FROM requests
             UNION ALL SELECT 'transactions', COUNT(*) FROM transactions;"
```

Compare counts against the backup metadata logged in KV:
```bash
wrangler kv key get --binding CACHE backup:last_success
```

---

## Monitoring

| KV Key                | Description                                      |
|-----------------------|--------------------------------------------------|
| `backup:last_success` | `{ timestamp, size, key }` of last successful backup |
| `backup:last_failure` | `{ timestamp, error }` — set on failure, TTL 2h  |

Check backup health:
```bash
wrangler kv key get --binding CACHE backup:last_success
wrangler kv key get --binding CACHE backup:last_failure
```

---

## Restoration Script

Reference: `scripts/restore.ts`

The script supports:
- `--key` — R2 object key to restore
- `--output` — output file path
- `--format json|sql` — output format (default: `json`)
- `--verify` — verify integrity only, no output file

---

## Failure & Retry

If a backup fails:
1. The error is logged to `backup:last_failure` in KV (2-hour TTL)
2. The next scheduled run (next day at 2:00 AM) will retry automatically
3. For immediate retry, trigger the scheduled event manually:
   ```bash
   wrangler dev --test-scheduled
   # Then: curl "http://localhost:8787/__scheduled?cron=0+2+*+*+*"
   ```

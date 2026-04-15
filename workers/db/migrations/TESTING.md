# Migration Testing Guide

This document provides step-by-step instructions for testing database migrations.

## Prerequisites

1. Node.js and npm installed
2. Wrangler CLI installed (`npm install -g wrangler`)
3. Cloudflare account (for remote testing)
4. Project dependencies installed (`npm install`)

## Test Plan

### Test 1: Initial Schema Migration (Local)

**Objective**: Verify that the initial schema migration creates all tables and indexes correctly.

**Steps**:
1. Run the migration:
   ```bash
   npm run db:init
   # OR
   bash scripts/migrate.sh init local
   # OR (Windows)
   .\scripts\migrate.ps1 init local
   ```

2. Verify tables were created:
   ```bash
   npm run db:verify
   ```

3. Expected output should show all tables:
   - users
   - requests
   - documents
   - document_access
   - comments
   - status_changes
   - transactions
   - audit_logs
   - notifications
   - public_statistics

4. Check table schema for users table:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="PRAGMA table_info(users);"
   ```

5. Verify indexes were created:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT name FROM sqlite_master WHERE type='index';"
   ```

**Expected Result**: All tables and indexes created successfully without errors.

---

### Test 2: Seed Data Population (Local)

**Objective**: Verify that seed data populates the database correctly with test data.

**Steps**:
1. Run the seed script:
   ```bash
   npm run db:seed
   # OR
   bash scripts/migrate.sh seed local
   # OR (Windows)
   .\scripts\migrate.ps1 seed local
   ```

2. Verify user count:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT COUNT(*) as count FROM users;"
   ```
   Expected: 11 users (1 superadmin, 3 staff accounts, 5 active students, 2 pending students)

3. Verify request count:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT COUNT(*) as count FROM requests;"
   ```
   Expected: 8 requests

4. Verify documents count:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT COUNT(*) as count FROM documents;"
   ```
   Expected: 6 documents

5. Verify transactions count:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT COUNT(*) as count FROM transactions;"
   ```
   Expected: 1 transaction

6. Check request statuses:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT status, COUNT(*) as count FROM requests GROUP BY status;"
   ```
   Expected: Various statuses (PAID, VERIFIED, APPROVED, UNDER_REVIEW, SUBMITTED, REJECTED, FLAGGED, PENDING_DOCUMENTS)

7. Verify foreign key relationships:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT r.id, r.status, u.first_name, u.last_name FROM requests r JOIN users u ON r.student_id = u.id LIMIT 5;"
   ```

**Expected Result**: All seed data inserted successfully with correct relationships.

---

### Test 3: Data Integrity Checks

**Objective**: Verify data integrity and foreign key constraints.

**Steps**:
1. Test user-request relationship:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT u.email, COUNT(r.id) as request_count FROM users u LEFT JOIN requests r ON u.id = r.student_id WHERE u.role = 'STUDENT' GROUP BY u.id;"
   ```

2. Test request-document relationship:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT r.id, r.type, COUNT(d.id) as doc_count FROM requests r LEFT JOIN documents d ON r.id = d.request_id GROUP BY r.id;"
   ```

3. Test status change history:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT request_id, from_status, to_status, changed_at FROM status_changes ORDER BY changed_at LIMIT 10;"
   ```

4. Test audit log entries:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action;"
   ```

5. Verify timestamp fields are populated:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT id, created_at, updated_at FROM users WHERE created_at IS NULL OR updated_at IS NULL;"
   ```
   Expected: No results (all timestamps should be populated)

**Expected Result**: All relationships intact, no orphaned records, all timestamps populated.

---

### Test 4: Rollback Migration (Local)

**Objective**: Verify that rollback migration drops all tables cleanly.

**Steps**:
1. Run the rollback script:
   ```bash
   npm run db:rollback
   # OR
   bash scripts/migrate.sh rollback local
   # OR (Windows)
   .\scripts\migrate.ps1 rollback local
   ```

2. Verify all tables are dropped:
   ```bash
   npm run db:verify
   ```
   Expected: No tables (or only sqlite internal tables)

3. Verify indexes are dropped:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT name FROM sqlite_master WHERE type='index';"
   ```
   Expected: No custom indexes

**Expected Result**: All tables and indexes dropped successfully.

---

### Test 5: Re-run Migration After Rollback

**Objective**: Verify that migrations can be re-run after rollback.

**Steps**:
1. Run initial migration again:
   ```bash
   npm run db:init
   ```

2. Verify tables created:
   ```bash
   npm run db:verify
   ```

3. Run seed data again:
   ```bash
   npm run db:seed
   ```

4. Verify data populated:
   ```bash
   wrangler d1 execute financial-transparency-db --local --command="SELECT COUNT(*) as count FROM users;"
   ```

**Expected Result**: Migration and seed work correctly after rollback.

---

### Test 6: Remote Migration (Production)

**Objective**: Verify migrations work on remote Cloudflare D1 database.

**Prerequisites**:
- Cloudflare account configured
- D1 database created
- `database_id` in wrangler.toml updated

**Steps**:
1. Create remote D1 database (if not exists):
   ```bash
   wrangler d1 create financial-transparency-db
   ```

2. Update `database_id` in wrangler.toml with the ID from step 1

3. Run remote migration:
   ```bash
   npm run db:init:remote
   # OR
   bash scripts/migrate.sh init remote
   # OR (Windows)
   .\scripts\migrate.ps1 init remote
   ```

4. Verify remote tables:
   ```bash
   npm run db:verify:remote
   ```

5. **DO NOT** run seed data on remote database

**Expected Result**: Remote database initialized successfully.

---

### Test 7: Migration Idempotency

**Objective**: Verify that running migrations multiple times doesn't cause errors.

**Steps**:
1. Run initial migration:
   ```bash
   npm run db:init
   ```

2. Run initial migration again (should handle "table already exists"):
   ```bash
   npm run db:init
   ```

3. Check for errors in output

**Expected Result**: Migration script handles existing tables gracefully (using IF NOT EXISTS).

---

### Test 8: Schema Validation with Drizzle

**Objective**: Verify that the SQL schema matches the Drizzle ORM schema.

**Steps**:
1. Generate Drizzle migration:
   ```bash
   npm run db:generate
   ```

2. Compare generated migration with 0001_initial_schema.sql

3. Check for differences in:
   - Table names
   - Column names and types
   - Constraints
   - Indexes

**Expected Result**: Generated migration matches manual migration.

---

## Test Credentials

Use these credentials to test authentication after seeding:

### Admin Accounts
- **Auditor**: auditor@bethelraysofhope.org / TestPass123!
- **Operations**: operations@bethelraysofhope.org / TestPass123!

### Student Accounts
- **Active**: james.omondi@example.com / TestPass123!
- **Pending**: lucy.wambui@example.com / TestPass123!

## Common Issues and Solutions

### Issue: "database not found"
**Solution**: Create the D1 database first:
```bash
wrangler d1 create financial-transparency-db
```

### Issue: "table already exists"
**Solution**: Run rollback first, then re-run migration:
```bash
npm run db:rollback
npm run db:init
```

### Issue: "foreign key constraint failed"
**Solution**: Ensure seed data is run after initial schema migration.

### Issue: Wrangler command not found
**Solution**: Install Wrangler globally:
```bash
npm install -g wrangler
```

### Issue: Permission denied on shell script
**Solution**: Make script executable:
```bash
chmod +x scripts/migrate.sh
```

## Automated Test Script

Create a test script to run all tests automatically:

```bash
#!/bin/bash
# test-migrations.sh

echo "Starting migration tests..."

# Test 1: Initial migration
echo "Test 1: Running initial migration..."
npm run db:rollback 2>/dev/null || true
npm run db:init
if [ $? -ne 0 ]; then echo "FAILED: Initial migration"; exit 1; fi
echo "PASSED: Initial migration"

# Test 2: Seed data
echo "Test 2: Running seed data..."
npm run db:seed
if [ $? -ne 0 ]; then echo "FAILED: Seed data"; exit 1; fi
echo "PASSED: Seed data"

# Test 3: Verify counts
echo "Test 3: Verifying data counts..."
USER_COUNT=$(wrangler d1 execute financial-transparency-db --local --command="SELECT COUNT(*) FROM users;" | grep -o '[0-9]\+')
if [ "$USER_COUNT" -ne 9 ]; then echo "FAILED: User count ($USER_COUNT != 9)"; exit 1; fi
echo "PASSED: Data counts"

# Test 4: Rollback
echo "Test 4: Testing rollback..."
npm run db:rollback
if [ $? -ne 0 ]; then echo "FAILED: Rollback"; exit 1; fi
echo "PASSED: Rollback"

# Test 5: Re-run migration
echo "Test 5: Re-running migration..."
npm run db:init
npm run db:seed
if [ $? -ne 0 ]; then echo "FAILED: Re-run migration"; exit 1; fi
echo "PASSED: Re-run migration"

echo "All tests passed!"
```

## Checklist

Before marking task 2.3 as complete, verify:

- [ ] Initial schema migration file created (0001_initial_schema.sql)
- [ ] Rollback migration file created (0001_rollback.sql)
- [ ] Seed data script created (seed_dev.sql)
- [ ] Migration README documentation created
- [ ] Shell script for migrations created (migrate.sh)
- [ ] PowerShell script for migrations created (migrate.ps1)
- [ ] Package.json scripts added for migrations
- [ ] All tables created successfully in local database
- [ ] All indexes created successfully
- [ ] Seed data populates correctly
- [ ] Foreign key relationships work
- [ ] Rollback works correctly
- [ ] Migration can be re-run after rollback
- [ ] Documentation is clear and complete

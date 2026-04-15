# Database Migrations

This directory contains SQL migration scripts for the Financial Transparency and Accountability System database.

## Migration Files

### Initial Schema Migration
- **0001_initial_schema.sql** - Creates all database tables and indexes
- **0001_rollback.sql** - Rolls back the initial schema (drops all tables)

### Seed Data
- **seed_dev.sql** - Populates the database with test data for development

## Running Migrations

### Using Wrangler CLI (Recommended for Cloudflare D1)

#### 1. Create the D1 Database (First Time Only)
```bash
# Create local D1 database for development
wrangler d1 create financial-transparency-db

# Update wrangler.toml with the database_id returned from the command above
```

#### 2. Run Initial Schema Migration
```bash
# Apply migration to local D1 database
wrangler d1 execute financial-transparency-db --local --file=./db/migrations/0001_initial_schema.sql

# Apply migration to remote D1 database (production)
wrangler d1 execute financial-transparency-db --file=./db/migrations/0001_initial_schema.sql
```

#### 3. Seed Development Data (Optional - Development Only)
```bash
# Seed local database with test data
wrangler d1 execute financial-transparency-db --local --file=./db/migrations/seed_dev.sql

# WARNING: Never run seed data on production!
```

#### 4. Rollback Migration (If Needed)
```bash
# Rollback local database
wrangler d1 execute financial-transparency-db --local --file=./db/migrations/0001_rollback.sql

# Rollback remote database (use with caution!)
wrangler d1 execute financial-transparency-db --file=./db/migrations/0001_rollback.sql
```

### Using Drizzle Kit (Alternative Method)

#### 1. Generate Migration from Schema
```bash
# Generate migration files from schema.ts
npx drizzle-kit generate:sqlite
```

#### 2. Push Schema to Database
```bash
# Push schema to local D1 database
npx drizzle-kit push:sqlite --config=drizzle.config.ts
```

## Verifying Migrations

### Check Database Tables
```bash
# List all tables in local database
wrangler d1 execute financial-transparency-db --local --command="SELECT name FROM sqlite_master WHERE type='table';"

# List all tables in remote database
wrangler d1 execute financial-transparency-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

### Check Table Schema
```bash
# View schema for a specific table
wrangler d1 execute financial-transparency-db --local --command="PRAGMA table_info(users);"
```

### Count Records (After Seeding)
```bash
# Count users
wrangler d1 execute financial-transparency-db --local --command="SELECT COUNT(*) as count FROM users;"

# Count requests
wrangler d1 execute financial-transparency-db --local --command="SELECT COUNT(*) as count FROM requests;"
```

## Migration Best Practices

1. **Always test migrations locally first** before applying to production
2. **Backup production database** before running migrations
3. **Never run seed_dev.sql on production** - it contains test data only
4. **Version control all migration files** - commit them to git
5. **Document breaking changes** in migration comments
6. **Test rollback scripts** to ensure they work correctly

## Test Credentials (Development Only)

All test users have the password: `TestPass123!`

### Admin Accounts
- **Auditor (Admin Level 2)**: auditor@bethelraysofhope.org
- **Operations (Admin Level 1)**: operations@bethelraysofhope.org
- **Admin (Admin Level 1)**: admin@bethelraysofhope.org

### Student Accounts (Active)
- james.omondi@example.com
- mary.njeri@example.com
- peter.kamau@example.com
- faith.akinyi@example.com
- david.kipchoge@example.com

### Student Accounts (Pending Approval)
- lucy.wambui@example.com
- samuel.otieno@example.com

## Troubleshooting

### Error: "database not found"
- Ensure you've created the D1 database using `wrangler d1 create`
- Check that `database_id` in wrangler.toml matches your created database

### Error: "table already exists"
- The migration has already been run
- Use the rollback script to drop tables, then re-run the migration

### Error: "foreign key constraint failed"
- Ensure you're running migrations in the correct order
- Check that parent tables exist before creating child tables

### Seed Data Not Loading
- Ensure the initial schema migration has been run first
- Check for syntax errors in the seed_dev.sql file
- Verify you're using the `--local` flag for local development

## Migration History

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 0001 | 2024-01-15 | Initial schema with all tables | System |

## Next Steps

After running migrations:
1. Verify all tables were created successfully
2. Run seed data script for development environment
3. Test database connections in the application
4. Verify foreign key relationships work correctly
5. Test CRUD operations on all tables

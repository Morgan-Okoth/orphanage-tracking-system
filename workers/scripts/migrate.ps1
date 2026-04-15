# Database Migration Script for Financial Transparency System (PowerShell)
# This script helps run migrations on Cloudflare D1 database

param(
    [Parameter(Position=0)]
    [ValidateSet('init', 'seed', 'rollback', 'verify', 'help')]
    [string]$Command = 'help',
    
    [Parameter(Position=1)]
    [ValidateSet('local', 'remote')]
    [string]$Environment = 'local'
)

# Database name from wrangler.toml
$DB_NAME = "financial-transparency-db"

# Function to print colored output
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Function to check if wrangler is installed
function Test-Wrangler {
    try {
        $version = wrangler --version 2>&1
        Write-Info "Wrangler CLI found: $version"
        return $true
    }
    catch {
        Write-Error-Custom "Wrangler CLI is not installed. Please install it first:"
        Write-Host "npm install -g wrangler"
        exit 1
    }
}

# Function to run migration
function Invoke-Migration {
    param(
        [string]$Env,
        [string]$File
    )
    
    $flag = if ($Env -eq 'local') { '--local' } else { '' }
    
    Write-Info "Running migration: $File ($Env environment)"
    
    if ($flag) {
        wrangler d1 execute $DB_NAME $flag --file="$File"
    }
    else {
        wrangler d1 execute $DB_NAME --file="$File"
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Migration completed successfully!"
    }
    else {
        Write-Error-Custom "Migration failed!"
        exit 1
    }
}

# Function to verify migration
function Test-Migration {
    param([string]$Env)
    
    $flag = if ($Env -eq 'local') { '--local' } else { '' }
    
    Write-Info "Verifying tables in $Env database..."
    
    if ($flag) {
        wrangler d1 execute $DB_NAME $flag --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
    }
    else {
        wrangler d1 execute $DB_NAME --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
    }
}

# Function to show usage
function Show-Usage {
    Write-Host @"
Usage: .\migrate.ps1 [command] [environment]

Commands:
  init       - Run initial schema migration
  seed       - Run seed data (development only)
  rollback   - Rollback initial schema
  verify     - Verify database tables
  help       - Show this help message

Environment:
  local      - Run on local D1 database (default)
  remote     - Run on remote D1 database (production)

Examples:
  .\migrate.ps1 init local          # Run initial migration locally
  .\migrate.ps1 seed local          # Seed local database with test data
  .\migrate.ps1 verify local        # Verify local database tables
  .\migrate.ps1 init remote         # Run initial migration on production
  .\migrate.ps1 rollback local      # Rollback local database
"@
}

# Main script
function Main {
    # Check if wrangler is installed
    Test-Wrangler
    
    # Execute command
    switch ($Command) {
        'init' {
            Write-Info "Initializing database schema..."
            Invoke-Migration -Env $Environment -File "./db/migrations/0001_initial_schema.sql"
            Test-Migration -Env $Environment
        }
        'seed' {
            if ($Environment -eq 'remote') {
                Write-Error-Custom "Cannot seed remote database! Seed data is for development only."
                exit 1
            }
            Write-Warning-Custom "This will populate the database with test data."
            $response = Read-Host "Continue? (y/n)"
            if ($response -eq 'y' -or $response -eq 'Y') {
                Invoke-Migration -Env $Environment -File "./db/migrations/seed_dev.sql"
            }
            else {
                Write-Info "Seed operation cancelled."
            }
        }
        'rollback' {
            Write-Warning-Custom "This will DROP ALL TABLES and DELETE ALL DATA!"
            $response = Read-Host "Are you sure? (y/n)"
            if ($response -eq 'y' -or $response -eq 'Y') {
                Invoke-Migration -Env $Environment -File "./db/migrations/0001_rollback.sql"
                Test-Migration -Env $Environment
            }
            else {
                Write-Info "Rollback cancelled."
            }
        }
        'verify' {
            Test-Migration -Env $Environment
        }
        'help' {
            Show-Usage
        }
        default {
            Write-Error-Custom "Unknown command: $Command"
            Show-Usage
            exit 1
        }
    }
}

# Run main function
Main

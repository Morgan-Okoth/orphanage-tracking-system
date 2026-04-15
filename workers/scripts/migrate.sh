#!/bin/bash

# Database Migration Script for Financial Transparency System
# This script helps run migrations on Cloudflare D1 database

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database name from wrangler.toml
DB_NAME="financial-transparency-db"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if wrangler is installed
check_wrangler() {
    if ! command -v wrangler &> /dev/null; then
        print_error "Wrangler CLI is not installed. Please install it first:"
        echo "npm install -g wrangler"
        exit 1
    fi
    print_info "Wrangler CLI found: $(wrangler --version)"
}

# Function to run migration
run_migration() {
    local env=$1
    local file=$2
    local flag=""
    
    if [ "$env" = "local" ]; then
        flag="--local"
    fi
    
    print_info "Running migration: $file ($env environment)"
    wrangler d1 execute $DB_NAME $flag --file="$file"
    
    if [ $? -eq 0 ]; then
        print_info "Migration completed successfully!"
    else
        print_error "Migration failed!"
        exit 1
    fi
}

# Function to verify migration
verify_migration() {
    local env=$1
    local flag=""
    
    if [ "$env" = "local" ]; then
        flag="--local"
    fi
    
    print_info "Verifying tables in $env database..."
    wrangler d1 execute $DB_NAME $flag --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [command] [environment]"
    echo ""
    echo "Commands:"
    echo "  init       - Run initial schema migration"
    echo "  seed       - Run seed data (development only)"
    echo "  rollback   - Rollback initial schema"
    echo "  verify     - Verify database tables"
    echo "  help       - Show this help message"
    echo ""
    echo "Environment:"
    echo "  local      - Run on local D1 database (default)"
    echo "  remote     - Run on remote D1 database (production)"
    echo ""
    echo "Examples:"
    echo "  $0 init local          # Run initial migration locally"
    echo "  $0 seed local          # Seed local database with test data"
    echo "  $0 verify local        # Verify local database tables"
    echo "  $0 init remote         # Run initial migration on production"
    echo "  $0 rollback local      # Rollback local database"
}

# Main script
main() {
    local command=${1:-help}
    local env=${2:-local}
    
    # Check if wrangler is installed
    check_wrangler
    
    # Validate environment
    if [ "$env" != "local" ] && [ "$env" != "remote" ]; then
        print_error "Invalid environment: $env. Must be 'local' or 'remote'"
        show_usage
        exit 1
    fi
    
    # Execute command
    case $command in
        init)
            print_info "Initializing database schema..."
            run_migration "$env" "./db/migrations/0001_initial_schema.sql"
            verify_migration "$env"
            ;;
        seed)
            if [ "$env" = "remote" ]; then
                print_error "Cannot seed remote database! Seed data is for development only."
                exit 1
            fi
            print_warning "This will populate the database with test data."
            read -p "Continue? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                run_migration "$env" "./db/migrations/seed_dev.sql"
            else
                print_info "Seed operation cancelled."
            fi
            ;;
        rollback)
            print_warning "This will DROP ALL TABLES and DELETE ALL DATA!"
            read -p "Are you sure? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                run_migration "$env" "./db/migrations/0001_rollback.sql"
                verify_migration "$env"
            else
                print_info "Rollback cancelled."
            fi
            ;;
        verify)
            verify_migration "$env"
            ;;
        help)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"

#!/bin/bash
# Seed MDC Staging database from Miami Dade production
# Usage: ./seed-from-production.sh

set -e

SERVER="ssdnodesatl1"
PROD_CONTAINER="miamidade_postgres"
STAGING_CONTAINER="mdc_staging_postgres"
DUMP_FILE="/tmp/miamidade_dump.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[SEED]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Load staging .env to get DB credentials
STAGING_ENV="/opt/mdc-staging/.env"

log "Reading staging database credentials..."
STAGING_DB_NAME=$(ssh "$SERVER" "grep '^DB_NAME=' $STAGING_ENV | cut -d= -f2")
STAGING_DB_USER=$(ssh "$SERVER" "grep '^DB_USER=' $STAGING_ENV | cut -d= -f2")

if [ -z "$STAGING_DB_NAME" ] || [ -z "$STAGING_DB_USER" ]; then
    error "Could not read staging DB credentials from $STAGING_ENV"
fi

log "Staging DB: $STAGING_DB_NAME (user: $STAGING_DB_USER)"

# Read production .env for dump credentials
PROD_ENV="/opt/miamidade/.env"
PROD_DB_NAME=$(ssh "$SERVER" "grep '^DB_NAME=' $PROD_ENV | cut -d= -f2")
PROD_DB_USER=$(ssh "$SERVER" "grep '^DB_USER=' $PROD_ENV | cut -d= -f2")

if [ -z "$PROD_DB_NAME" ] || [ -z "$PROD_DB_USER" ]; then
    error "Could not read production DB credentials from $PROD_ENV"
fi

log "Production DB: $PROD_DB_NAME (user: $PROD_DB_USER)"

# Step 1: Dump production database
log "Dumping production database..."
ssh "$SERVER" "docker exec $PROD_CONTAINER pg_dump -U $PROD_DB_USER -d $PROD_DB_NAME --no-owner --no-acl > $DUMP_FILE"

DUMP_SIZE=$(ssh "$SERVER" "du -h $DUMP_FILE | cut -f1")
log "Dump created: $DUMP_SIZE"

# Step 2: Drop and recreate staging database
log "Resetting staging database..."
ssh "$SERVER" "docker exec $STAGING_CONTAINER psql -U $STAGING_DB_USER -d postgres -c 'DROP DATABASE IF EXISTS $STAGING_DB_NAME;'"
ssh "$SERVER" "docker exec $STAGING_CONTAINER psql -U $STAGING_DB_USER -d postgres -c 'CREATE DATABASE $STAGING_DB_NAME OWNER $STAGING_DB_USER;'"

# Step 3: Restore dump into staging
log "Restoring dump into staging database..."
ssh "$SERVER" "cat $DUMP_FILE | docker exec -i $STAGING_CONTAINER psql -U $STAGING_DB_USER -d $STAGING_DB_NAME"

# Step 4: Clean up dump file
ssh "$SERVER" "rm -f $DUMP_FILE"
log "Cleaned up dump file"

# Step 5: Show verification
log "Verifying restore — table row counts:"
ssh "$SERVER" "docker exec $STAGING_CONTAINER psql -U $STAGING_DB_USER -d $STAGING_DB_NAME -c \"
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
\""

log "Database seeded successfully from production!"
log "You can now login with production credentials at https://mdc-staging.theprogram1814.com"

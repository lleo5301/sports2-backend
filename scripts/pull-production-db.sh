#!/bin/bash
# Pull production database dump from Miami Dade and optionally restore locally
# Usage:
#   ./scripts/pull-production-db.sh              # Just download the dump
#   ./scripts/pull-production-db.sh --restore    # Download and restore to local Docker DB

set -euo pipefail

# Configuration
SERVER="ssdnodesatl1"
REMOTE_CONTAINER="miamidade_postgres"
REMOTE_DB_NAME="miamidade_db"
REMOTE_DB_USER="miamidade_user"

LOCAL_CONTAINER="sports2_backend_db"
LOCAL_DB_NAME="sports2"
LOCAL_DB_USER="postgres"

DUMP_DIR="/tmp"
DATE=$(date +%Y-%m-%d_%H%M%S)
DUMP_FILE="${DUMP_DIR}/miamidade_${DATE}.sql"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[PULL-DB]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }

# Step 1: Pull the dump from production
log "Pulling database dump from production (${SERVER})..."
log "Remote: ${REMOTE_CONTAINER} / ${REMOTE_DB_NAME}"

ssh "$SERVER" "docker exec ${REMOTE_CONTAINER} pg_dump -U ${REMOTE_DB_USER} -d ${REMOTE_DB_NAME} --no-owner --no-acl" \
  > "$DUMP_FILE"

DUMP_SIZE=$(stat -f%z "$DUMP_FILE" 2>/dev/null || stat -c%s "$DUMP_FILE" 2>/dev/null)
if [ "$DUMP_SIZE" -lt 100 ]; then
  rm -f "$DUMP_FILE"
  err "Dump file is suspiciously small (${DUMP_SIZE} bytes). Check SSH connection and container."
fi

log "Dump saved: ${DUMP_FILE} ($(du -h "$DUMP_FILE" | cut -f1))"

# Count tables and rows in the dump for verification
TABLE_COUNT=$(grep -c "^CREATE TABLE" "$DUMP_FILE" || echo "0")
log "Tables found in dump: ${TABLE_COUNT}"

if [ "${1:-}" != "--restore" ]; then
  log "Dump downloaded. To restore to local Docker DB, run:"
  log "  $0 --restore"
  log ""
  log "Or manually:"
  log "  docker exec -i ${LOCAL_CONTAINER} psql -U ${LOCAL_DB_USER} -d ${LOCAL_DB_NAME} < ${DUMP_FILE}"
  exit 0
fi

# Step 2: Restore to local Docker DB
warn ""
warn "=== DESTRUCTIVE OPERATION ==="
warn "This will DROP the local '${LOCAL_DB_NAME}' database and replace it"
warn "with the production dump from Miami Dade."
warn ""
warn "Local container: ${LOCAL_CONTAINER}"
warn "Database to drop: ${LOCAL_DB_NAME}"
warn "Dump file: ${DUMP_FILE} (${TABLE_COUNT} tables)"
warn ""
read -rp "Type 'yes' to confirm: " confirm
if [ "$confirm" != "yes" ]; then
  log "Restore cancelled. Dump file kept at: ${DUMP_FILE}"
  exit 0
fi

# Verify local container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${LOCAL_CONTAINER}$"; then
  err "Local container '${LOCAL_CONTAINER}' is not running. Start it with: docker compose up -d"
fi

log "Terminating active connections to '${LOCAL_DB_NAME}'..."
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${LOCAL_DB_NAME}' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true

log "Dropping local database '${LOCAL_DB_NAME}'..."
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS \"${LOCAL_DB_NAME}\";"

log "Creating fresh database '${LOCAL_DB_NAME}'..."
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d postgres -c \
  "CREATE DATABASE \"${LOCAL_DB_NAME}\";"

log "Restoring dump..."
docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" < "$DUMP_FILE" > /dev/null 2>&1

# Verify restore
RESTORED_TABLES=$(docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
RESTORED_TABLES=$(echo "$RESTORED_TABLES" | tr -d ' ')

log "Restore complete! Tables in local DB: ${RESTORED_TABLES}"

# Show row counts for key tables
log "Row counts for key tables:"
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -c \
  "SELECT schemaname, relname as table_name, n_live_tup as row_count
   FROM pg_stat_user_tables
   WHERE n_live_tup > 0
   ORDER BY n_live_tup DESC
   LIMIT 15;"

log ""
log "Next step: Run migrations to test schema changes"
log "  docker exec sports2_backend npm run db:migrate"

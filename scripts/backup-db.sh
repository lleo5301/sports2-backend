#!/bin/bash
# Daily PostgreSQL backup script for Miami Dade production deployment
# Usage: ./backup-db.sh [--restore BACKUP_FILE]
#
# Intended to run via cron on the production server (ssdnodesatl1):
#   0 2 * * * /opt/miamidade/scripts/backup-db.sh >> /opt/miamidade/backups/backup.log 2>&1
#
# Or run manually from local machine:
#   ssh ssdnodesatl1 "/opt/miamidade/scripts/backup-db.sh"

set -euo pipefail

# Configuration
CONTAINER="miamidade_postgres"
DB_NAME="${DB_NAME:-miamidade_db}"
DB_USER="${DB_USER:-miamidade_user}"
BACKUP_DIR="${BACKUP_DIR:-/opt/miamidade/backups}"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}[BACKUP]${NC} $1"; }
warn() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}[ERROR]${NC} $1" >&2; exit 1; }

restore_db() {
  local backup_file="$1"

  if [ ! -f "$backup_file" ]; then
    err "Backup file not found: $backup_file"
  fi

  warn "This will DROP and recreate the database '${DB_NAME}'."
  warn "All current data will be replaced with the backup."
  read -rp "Type 'yes' to confirm: " confirm
  if [ "$confirm" != "yes" ]; then
    log "Restore cancelled."
    exit 0
  fi

  log "Restoring from: $backup_file"

  # Terminate active connections
  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

  # Drop and recreate
  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";"
  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";"

  # Restore (handle both .gz and plain .sql)
  if [[ "$backup_file" == *.gz ]]; then
    gunzip -c "$backup_file" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" > /dev/null
  else
    docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$backup_file" > /dev/null
  fi

  log "Restore complete. Verify with:"
  log "  docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c '\\dt'"
}

# Handle --restore flag
if [ "${1:-}" = "--restore" ]; then
  if [ -z "${2:-}" ]; then
    err "Usage: $0 --restore BACKUP_FILE"
  fi
  restore_db "$2"
  exit 0
fi

# --- Backup mode ---

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  err "Container '${CONTAINER}' is not running."
fi

log "Starting backup of '${DB_NAME}'..."

# Create compressed backup using pg_dump inside the container
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
  | gzip > "$BACKUP_FILE"

# Verify backup is not empty
BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
if [ "$BACKUP_SIZE" -lt 100 ]; then
  rm -f "$BACKUP_FILE"
  err "Backup file is suspiciously small (${BACKUP_SIZE} bytes). Aborting."
fi

log "Backup saved: $BACKUP_FILE ($(numfmt --to=iec "$BACKUP_SIZE" 2>/dev/null || echo "${BACKUP_SIZE} bytes"))"

# Rotate old backups - remove files older than RETENTION_DAYS
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  log "Cleaned up $DELETED backup(s) older than ${RETENTION_DAYS} days."
fi

# List current backups
log "Current backups:"
ls -lh "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'

log "Backup complete."

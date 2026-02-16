#!/bin/bash
# Daily PostgreSQL backup script for Miami Dade production deployment
# Usage: ./backup-db.sh [--restore BACKUP_FILE]
#
# Intended to run via cron on the production server (ssdnodesatl1):
#   0 2 * * * /opt/miamidade/scripts/backup-db.sh >> /opt/miamidade/backups/backup.log 2>&1
#
# Or run manually from local machine:
#   ssh ssdnodesatl1 "/opt/miamidade/scripts/backup-db.sh"
#
# SETUP (one-time on server):
#   1. Install b2 CLI:  pip3 install b2
#   2. Create env file: /opt/miamidade/.backup-env with:
#        B2_KEY_ID=0017ec5c2560c670000000003
#        B2_APP_KEY=<your-application-key>
#        B2_BUCKET=theprogram1814
#   3. Secure it:       chmod 600 /opt/miamidade/.backup-env
#   4. Authorize b2:    b2 account authorize $B2_KEY_ID $B2_APP_KEY

set -euo pipefail

# Configuration
CONTAINER="miamidade_postgres"
DB_NAME="${DB_NAME:-miamidade_db}"
DB_USER="${DB_USER:-miamidade_user}"
BACKUP_DIR="${BACKUP_DIR:-/opt/miamidade/backups}"
RETENTION_DAYS=7
REMOTE_RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"

# Backblaze B2 (loaded from env file if present)
B2_ENV_FILE="${B2_ENV_FILE:-/opt/miamidade/.backup-env}"
if [ -f "$B2_ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$B2_ENV_FILE"
fi
B2_BUCKET="${B2_BUCKET:-}"
B2_KEY_ID="${B2_KEY_ID:-}"
B2_APP_KEY="${B2_APP_KEY:-}"
B2_FOLDER="backups/miamidade"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}[BACKUP]${NC} $1"; }
warn() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}[ERROR]${NC} $1" >&2; exit 1; }

upload_to_b2() {
  local file="$1"
  local filename
  filename=$(basename "$file")

  # Check if b2 CLI is installed
  if ! command -v b2 &> /dev/null; then
    warn "b2 CLI not installed. Skipping offsite upload."
    warn "Install with: pip3 install b2"
    return 1
  fi

  if [ -z "$B2_BUCKET" ]; then
    warn "B2_BUCKET not set. Skipping offsite upload."
    warn "Create /opt/miamidade/.backup-env with B2_BUCKET, B2_KEY_ID, B2_APP_KEY"
    return 1
  fi

  # Authorize if needed (b2 caches auth)
  if [ -n "$B2_KEY_ID" ] && [ -n "$B2_APP_KEY" ]; then
    b2 account authorize "$B2_KEY_ID" "$B2_APP_KEY" > /dev/null 2>&1 || {
      warn "B2 authorization failed. Check credentials in $B2_ENV_FILE"
      return 1
    }
  fi

  log "Uploading to Backblaze B2: ${B2_BUCKET}/${B2_FOLDER}/${filename}"
  if b2 file upload "${B2_BUCKET}" "$file" "${B2_FOLDER}/${filename}" > /dev/null 2>&1; then
    log "B2 upload complete."
  else
    warn "B2 upload failed. Local backup is still available at: $file"
    return 1
  fi
}

cleanup_old_b2_backups() {
  if ! command -v b2 &> /dev/null || [ -z "$B2_BUCKET" ]; then
    return 0
  fi

  local cutoff_date
  cutoff_date=$(date -d "-${REMOTE_RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || \
                date -v-${REMOTE_RETENTION_DAYS}d +%Y-%m-%d 2>/dev/null || echo "")

  if [ -z "$cutoff_date" ]; then
    return 0
  fi

  log "Cleaning B2 backups older than ${REMOTE_RETENTION_DAYS} days (before ${cutoff_date})..."

  # List files in the backup folder and delete old ones
  local deleted=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file_name
    file_name=$(echo "$line" | awk '{print $NF}')
    # Extract date from filename: miamidade_db_YYYY-MM-DD_HHMMSS.sql.gz
    local file_date
    file_date=$(echo "$file_name" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || echo "")

    if [ -n "$file_date" ] && [[ "$file_date" < "$cutoff_date" ]]; then
      if b2 rm "b2://${B2_BUCKET}/${file_name}" > /dev/null 2>&1; then
        deleted=$((deleted + 1))
      fi
    fi
  done < <(b2 ls --long "b2://${B2_BUCKET}/${B2_FOLDER}/" 2>/dev/null || true)

  if [ "$deleted" -gt 0 ]; then
    log "Cleaned up $deleted old B2 backup(s)."
  fi
}

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

# Upload to Backblaze B2 (offsite backup)
upload_to_b2 "$BACKUP_FILE"

# Rotate old local backups
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  log "Cleaned up $DELETED local backup(s) older than ${RETENTION_DAYS} days."
fi

# Rotate old B2 backups
cleanup_old_b2_backups

# List current local backups
log "Current local backups:"
ls -lh "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'

log "Backup complete."

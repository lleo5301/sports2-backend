#!/bin/bash
# MDC Staging Deployment Script
# Usage: ./deploy.sh [backend|frontend|all|status]

set -e

# Configuration
SERVER="ssdnodesatl1"
DEPLOY_PATH="/opt/mdc-staging"
BACKEND_SRC="$(dirname "$0")/../../"
FRONTEND_SRC="$(dirname "$0")/../../../sports2-frontend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

deploy_backend() {
    log "Deploying backend to staging..."

    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude 'uploads/*' \
        --exclude '.env' \
        --exclude 'coverage' \
        --exclude '.DS_Store' \
        --exclude '__tests__' \
        --exclude '*.test.js' \
        --exclude 'deployments' \
        "$BACKEND_SRC" \
        "$SERVER:$DEPLOY_PATH/backend/"

    log "Rebuilding backend container..."
    ssh "$SERVER" "cd $DEPLOY_PATH && docker compose build backend"

    log "Restarting backend..."
    ssh "$SERVER" "cd $DEPLOY_PATH && docker compose up -d backend"

    log "Running migrations..."
    ssh "$SERVER" "docker exec mdc_staging_backend npx sequelize-cli db:migrate"

    log "Backend deployed successfully!"
}

deploy_frontend() {
    log "Deploying frontend to staging..."

    if [ ! -d "$FRONTEND_SRC" ]; then
        error "Frontend source not found at $FRONTEND_SRC"
    fi

    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '.env' \
        --exclude 'dist' \
        --exclude '.playwright-mcp' \
        --exclude 'tests' \
        "$FRONTEND_SRC/" \
        "$SERVER:$DEPLOY_PATH/frontend/"

    log "Rebuilding frontend container..."
    ssh "$SERVER" "cd $DEPLOY_PATH && docker compose build frontend"

    log "Restarting frontend..."
    ssh "$SERVER" "cd $DEPLOY_PATH && docker compose up -d frontend"

    log "Frontend deployed successfully!"
}

status() {
    log "Checking staging deployment status..."
    ssh "$SERVER" "docker ps --filter 'name=mdc_staging' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
}

case "${1:-all}" in
    backend)
        deploy_backend
        ;;
    frontend)
        deploy_frontend
        ;;
    all)
        deploy_backend
        deploy_frontend
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 [backend|frontend|all|status]"
        exit 1
        ;;
esac

status
log "Deployment complete! https://mdc-staging.theprogram1814.com"

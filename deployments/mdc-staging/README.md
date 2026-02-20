# MDC Staging Deployment

Staging environment for Miami Dade College, running on the same server as production.

## Server Details

| Property | Value |
|----------|-------|
| Server | `ssdnodesatl1` (172.93.54.227) |
| Domain | https://mdc-staging.theprogram1814.com |
| Deploy Path | `/opt/mdc-staging` |
| Backend Port | 5002 (host) → 5000 (container) |
| Frontend Port | 3003 (host) → 3000 (container) |
| Database Port | 5434 (host) → 5432 (container) |

## Quick Deploy

```bash
# Deploy everything (backend + frontend)
./deploy.sh

# Deploy only backend
./deploy.sh backend

# Deploy only frontend
./deploy.sh frontend

# Check status
./deploy.sh status
```

## Initial Setup

### 1. Create server directories

```bash
ssh ssdnodesatl1 "mkdir -p /opt/mdc-staging/{backend,frontend,uploads}"
```

### 2. Create .env file

```bash
# Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
CSRF_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 16)

# Create .env on server
ssh ssdnodesatl1 "cat > /opt/mdc-staging/.env << EOF
DB_NAME=mdc_staging_db
DB_USER=mdc_staging_user
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
CSRF_SECRET=$CSRF_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF"
```

### 3. DNS

Add an A record for `mdc-staging.theprogram1814.com` pointing to `172.93.54.227`.

### 4. SSL Certificate

```bash
ssh ssdnodesatl1 "certbot certonly --nginx -d mdc-staging.theprogram1814.com"
```

### 5. Nginx Configuration

```bash
# Copy nginx config to server
scp nginx.conf ssdnodesatl1:/etc/nginx/sites-available/mdc-staging.theprogram1814.com

# Enable the site
ssh ssdnodesatl1 "ln -sf /etc/nginx/sites-available/mdc-staging.theprogram1814.com /etc/nginx/sites-enabled/"

# Test and reload nginx
ssh ssdnodesatl1 "nginx -t && systemctl reload nginx"
```

### 6. Deploy

```bash
./deploy.sh all
```

### 7. Seed Database from Production

```bash
./seed-from-production.sh
```

## Verification

```bash
# All 3 containers running
./deploy.sh status

# Backend health check
curl https://mdc-staging.theprogram1814.com/health

# API responds
curl https://mdc-staging.theprogram1814.com/api/v1/auth/csrf-token

# Open in browser
open https://mdc-staging.theprogram1814.com
```

Login with the same credentials as production (e.g., `admin@sports2.com`).

## Container Management

```bash
# View logs
ssh ssdnodesatl1 "docker logs mdc_staging_backend --tail 100"
ssh ssdnodesatl1 "docker logs mdc_staging_frontend --tail 100"

# Restart services
ssh ssdnodesatl1 "cd /opt/mdc-staging && docker compose restart backend"

# Shell into container
ssh ssdnodesatl1 "docker exec -it mdc_staging_backend sh"

# Database access
ssh ssdnodesatl1 "docker exec -it mdc_staging_postgres psql -U mdc_staging_user -d mdc_staging_db"
```

## Key Differences from Production

| Setting | Production | Staging |
|---------|-----------|---------|
| Domain | `miamidade.theprogram1814.com` | `mdc-staging.theprogram1814.com` |
| Backend Port | 5001 | 5002 |
| Frontend Port | 3001 | 3003 |
| DB Port | 5433 | 5434 |
| DISABLE_SYNC | not set | `true` |
| Container Prefix | `miamidade_` | `mdc_staging_` |

## Files

- `docker-compose.yml` — Docker Compose configuration
- `.env.example` — Environment variables template
- `nginx.conf` — Nginx site configuration
- `deploy.sh` — Deployment script
- `seed-from-production.sh` — Seed staging DB from production dump

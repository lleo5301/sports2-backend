# Miami Dade College Deployment

Production deployment for Miami Dade Sharks baseball team.

## Server Details

| Property | Value |
|----------|-------|
| Server | `ssdnodesatl1` (172.93.54.227) |
| Domain | https://miamidade.theprogram1814.com |
| Deploy Path | `/opt/miamidade` |
| Backend Port | 5001 (internal) |
| Frontend Port | 3001 (internal) |
| Database Port | 5433 (internal) |

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

## Manual Deployment

### 1. Sync Backend Code
```bash
rsync -avz --delete \
  --exclude 'node_modules' --exclude '.git' --exclude 'uploads/*' \
  --exclude '.env' --exclude 'coverage' --exclude '__tests__' \
  ../../ ssdnodesatl1:/opt/miamidade/backend/
```

### 2. Rebuild & Restart
```bash
ssh ssdnodesatl1 "cd /opt/miamidade && docker compose build backend && docker compose up -d backend"
```

### 3. Run Migrations
```bash
ssh ssdnodesatl1 "docker exec miamidade_backend npx sequelize-cli db:migrate"
```

## Container Management

```bash
# View logs
ssh ssdnodesatl1 "docker logs miamidade_backend --tail 100"
ssh ssdnodesatl1 "docker logs miamidade_frontend --tail 100"

# Restart services
ssh ssdnodesatl1 "cd /opt/miamidade && docker compose restart backend"

# Shell into container
ssh ssdnodesatl1 "docker exec -it miamidade_backend sh"

# Database access
ssh ssdnodesatl1 "docker exec -it miamidade_postgres psql -U miamidade_user -d miamidade_db"
```

## SSL Certificate

SSL is managed by Certbot with auto-renewal. To manually renew:
```bash
ssh ssdnodesatl1 "certbot renew"
```

## Files

- `docker-compose.yml` - Docker Compose configuration
- `.env.example` - Environment variables template
- `nginx.conf` - Nginx site configuration
- `deploy.sh` - Deployment script

## Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@sports2.com | Admin123! |
| Demo User | user@example.com | password |

# Integration Credentials System Design

**Date:** 2026-01-27
**Status:** Implemented

## Overview

A unified credential management system for external integrations (PrestoSports, Hudl, Synergy, etc.) with support for encrypted storage, OAuth2 token refresh, and automatic deactivation on failures.

## Problem Statement

The previous system stored Presto credentials directly in the `teams` table:
- `presto_credentials` (encrypted JSON)
- `presto_team_id`
- `presto_season_id`

This approach had limitations:
1. No support for multiple integration providers per team
2. No OAuth2 token management (access/refresh tokens, expiration)
3. No automatic token refresh or failure tracking
4. Coupling between team data and integration credentials

## Solution

### Database Schema

**Table: `integration_credentials`**

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| team_id | INTEGER | FK to teams |
| provider | VARCHAR(50) | Integration provider: 'presto', 'hudl', 'synergy' |
| credential_type | ENUM | 'oauth2', 'basic', 'api_key' |
| credentials_encrypted | TEXT | Encrypted JSON (username/password or API key) |
| access_token_encrypted | TEXT | Encrypted access token |
| refresh_token_encrypted | TEXT | Encrypted refresh token |
| token_expires_at | TIMESTAMP | Access token expiration |
| refresh_token_expires_at | TIMESTAMP | Refresh token expiration |
| last_refreshed_at | TIMESTAMP | Last successful refresh |
| refresh_error_count | INTEGER | Consecutive failures (default 0) |
| last_refresh_error | TEXT | Sanitized error message |
| is_active | BOOLEAN | False if deactivated |
| config | JSONB | Provider-specific config |

**Indexes:**
- Unique on `(team_id, provider)` - one credential set per provider per team
- Index on `provider` - finding all credentials for a provider
- Index on `is_active` - filtering active credentials
- Index on `token_expires_at` - finding expiring tokens

### Service Layer

**IntegrationCredentialService** (`src/services/integrationCredentialService.js`)

Key methods:
- `getCredentials(teamId, provider)` - Get decrypted credentials and token status
- `saveCredentials(teamId, provider, credentials, config, type)` - Save new credentials
- `saveTokens(teamId, provider, tokens)` - Save OAuth tokens with expiration
- `updateConfig(teamId, provider, config)` - Update provider config
- `refreshTokenIfNeeded(teamId, provider, refreshFn)` - Auto-refresh with backoff
- `deactivateCredentials(teamId, provider)` - Soft delete
- `deleteCredentials(teamId, provider)` - Hard delete
- `getTeamIntegrations(teamId)` - List all integrations for a team
- `findCredentialsNeedingRefresh(bufferMinutes)` - For background refresh job

### Auto-Refresh Logic

1. Check if token is expired (with 5-minute buffer)
2. If expired, check refresh token availability
3. Attempt refresh using provider's refresh function
4. On success: reset error count, update tokens
5. On failure: increment error count, record sanitized error
6. After 3 consecutive failures: deactivate credentials

### Error Sanitization

All error messages are sanitized before storage:
- JWTs replaced with `***JWT***`
- Bearer tokens replaced with `Bearer ***`
- Passwords replaced with `password: ***`
- Token values replaced with `token: ***`

## Migration Strategy

The migration automatically migrates existing Presto credentials:

```sql
INSERT INTO integration_credentials (team_id, provider, credential_type, ...)
SELECT id, 'presto', 'basic', presto_credentials, ...
FROM teams
WHERE presto_credentials IS NOT NULL;
```

## Files Changed

1. **New Files:**
   - `src/migrations/20260127000004-create-integration-credentials.js`
   - `src/models/IntegrationCredential.js`
   - `src/services/integrationCredentialService.js`

2. **Modified Files:**
   - `src/models/index.js` - Added model exports and associations
   - `src/services/prestoSyncService.js` - Use credential service instead of team fields
   - `src/services/prestoSportsService.js` - Added `clearCachedToken()` method
   - `src/routes/integrations.js` - Use credential service for all CRUD operations

## Usage Examples

### Configure PrestoSports

```javascript
await integrationCredentialService.saveCredentials(
  teamId,
  'presto',
  { username, password },
  { team_id: prestoTeamId, season_id: prestoSeasonId },
  'basic'
);
```

### Get Credentials with Token

```javascript
const { credentials, accessToken, config, isTokenExpired } =
  await integrationCredentialService.getCredentials(teamId, 'presto');
```

### Future: Add Hudl Integration

```javascript
await integrationCredentialService.saveCredentials(
  teamId,
  'hudl',
  { apiKey: 'xxx' },
  { organization_id: '123' },
  'api_key'
);
```

## Future Enhancements

1. **Background Token Refresh Job:** Use `findCredentialsNeedingRefresh()` to proactively refresh tokens before they expire
2. **Webhook Support:** Add webhook URLs to config for real-time sync notifications
3. **Multi-Tenant OAuth:** Support OAuth2 flows with authorization code grant
4. **Audit Logging:** Track credential access and changes for compliance

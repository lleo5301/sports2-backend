# Sync Logging System Design

**Date:** 2026-01-27
**Status:** Implemented

## Overview

Track all PrestoSports sync operations with detailed audit trail for observability, debugging, and compliance. All sensitive data (credentials, tokens) is obfuscated before storage.

## Table Structure

### sync_logs

```sql
CREATE TABLE sync_logs (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  sync_type ENUM('roster', 'schedule', 'stats', 'team_record', 'season_stats', 'career_stats', 'full'),
  source_system ENUM('presto', 'manual', 'other') DEFAULT 'presto',
  api_endpoint VARCHAR(500),  -- Sanitized (tokens redacted)
  status ENUM('started', 'completed', 'partial', 'failed'),
  initiated_by INTEGER REFERENCES users(id),  -- NULL for automated syncs

  -- Timing
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INTEGER,

  -- Request Context
  request_params JSONB,  -- Sanitized parameters

  -- Result Counts
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,

  -- Response Summary
  response_summary JSONB,  -- High-level results

  -- Error Tracking
  error_message TEXT,     -- Sanitized main error
  item_errors JSONB,      -- Array of individual failures

  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

### Indexes

- `idx_sync_logs_team_id` - Fast team lookups
- `idx_sync_logs_sync_type` - Filter by type
- `idx_sync_logs_status` - Find failures
- `idx_sync_logs_started_at` - Time-based queries
- `idx_sync_logs_team_type_date` - Composite for "last sync of type X for team Y"

## Data Obfuscation

### Sensitive Fields Never Stored
- Credentials (username/password)
- JWT tokens
- API keys

### Sanitization Methods

```javascript
// URL sanitization
SyncLog.sanitizeEndpoint(url)
// Removes: token=, key=, auth=, password=, Bearer, idToken=

// Error sanitization
SyncLog.sanitizeError(error)
// Removes: JWT patterns, Bearer tokens, password/token values

// Parameter sanitization
SyncLog.sanitizeParams(params)
// Removes: password, token, idToken, accessToken, refreshToken, credentials, auth, secret
```

## Helper Methods

### SyncLog.logStart(teamId, syncType, userId, endpoint, params)
Creates a new log entry with status 'started'.

### SyncLog.logComplete(logId, results)
Updates log with results. Auto-determines status:
- `completed` - All items succeeded
- `partial` - Some failures but some successes
- `failed` - All items failed

### SyncLog.logFailure(logId, error, itemErrors)
Marks sync as failed with sanitized error details.

### SyncLog.getLastSuccessfulSync(teamId, syncType)
Returns most recent successful sync for a team/type.

### SyncLog.getSyncHistory(teamId, options)
Returns paginated sync history with optional filters.

## Integration Points

All sync methods in `prestoSyncService.js` now:
1. Call `SyncLog.logStart()` at beginning
2. Call `SyncLog.logComplete()` on success
3. Call `SyncLog.logFailure()` on error

### Sync Types Logged
- `roster` - Player roster sync
- `schedule` - Game schedule sync
- `stats` - Per-game statistics sync
- `team_record` - W-L record sync
- `season_stats` - Player season aggregates
- `career_stats` - Player career totals
- `full` - Complete sync (all of above)

## Files Modified

- **Migration:** `src/migrations/20260127000003-create-sync-logs.js`
- **Model:** `src/models/SyncLog.js`
- **Model Index:** `src/models/index.js` (added import/export/associations)
- **Service:** `src/services/prestoSyncService.js` (integrated logging)

## Example Log Entry

```json
{
  "id": 1,
  "team_id": 1,
  "sync_type": "roster",
  "source_system": "presto",
  "api_endpoint": "/api/v2/teams/12345/players",
  "status": "completed",
  "initiated_by": 2,
  "started_at": "2026-01-27T12:00:00Z",
  "completed_at": "2026-01-27T12:00:05Z",
  "duration_ms": 5000,
  "request_params": {
    "presto_team_id": "12345",
    "presto_season_id": "2025-26"
  },
  "items_created": 0,
  "items_updated": 24,
  "items_failed": 0,
  "response_summary": {
    "players_processed": 24
  },
  "error_message": null,
  "item_errors": null
}
```

## Retention Strategy

Logs can be archived/deleted after 90 days using the `started_at` index. A cleanup job can be implemented later if needed.

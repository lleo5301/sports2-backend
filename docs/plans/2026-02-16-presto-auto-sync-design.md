# PrestoSports Auto-Sync Design

## Goal

Automate PrestoSports data syncing so coaches don't have to manually trigger sync endpoints. Full roster/schedule/stats sync runs every 4 hours; live game stats poll every 2 minutes on game days.

## Architecture

**Approach:** In-process Node.js scheduler using `node-cron`. Runs inside the existing Express backend — no new infrastructure, no Redis, no external workers.

**Why:** Single-server deployment (Miami Dade) syncing a few-second operation for 1 team. The complexity of a job queue or external scheduler isn't justified. Can extract to a queue later if needed.

## Components

### New File: `src/services/syncScheduler.js`

A `SyncScheduler` class that manages two cron jobs:

**1. Full Sync — `0 */4 * * *` (every 4 hours at :00)**
- Queries `IntegrationCredential` for all teams with active PrestoSports credentials
- For each team: calls `prestoSyncService.syncAll(teamId)`
- SyncLog records each sync with `initiated_by: null` (automated)
- Teams are processed sequentially (not in parallel) to avoid API rate limiting

**2. Live Stats Poller — `*/2 * * * *` (every 2 minutes)**
- Queries all teams with active PrestoSports credentials
- For each team: calls `prestoSyncService.getLiveEligibleGames(teamId)`
- If games are in progress: calls `prestoSyncService.syncLiveStats(teamId, gameId)` for each
- Skips teams with no games today (fast no-op)

### Modified File: `src/server.js`

Start the scheduler after Express is listening:
- Only in `production` and `development` environments
- Never in `test` (prevents cron from running during Jest)
- Stop scheduler on graceful shutdown (`SIGTERM`/`SIGINT`)

### Modified File: `package.json`

Add `node-cron` dependency.

## Safety Guards

| Guard | How |
|-------|-----|
| **No overlapping syncs** | In-memory `Set` of team IDs currently syncing. Skip if team is already in a sync. |
| **No sync in test** | Scheduler checks `NODE_ENV !== 'test'` before starting |
| **Credential auto-deactivation** | After 3 consecutive token refresh failures, `IntegrationCredential.is_active` → false. Scheduler only queries `is_active: true`. |
| **Error isolation** | Each team's sync is wrapped in try/catch. One team failing doesn't affect others. |
| **Graceful shutdown** | `scheduler.stop()` cancels cron jobs on process exit signals |
| **Logging** | All scheduler actions logged via `logger` (start, stop, skip, errors) |

## SyncLog Differentiation

Automated syncs are distinguishable from manual syncs:
- Manual: `initiated_by` = user ID (set by route handler)
- Automated: `initiated_by` = null (set by scheduler)

Existing `SyncLog.logStart()` already accepts `userId` parameter — passing `null` marks it as automated.

## Data Flow

```
Server boots
  └─ syncScheduler.start()
       ├─ Full sync cron: "0 */4 * * *"
       │    └─ IntegrationCredential.findAll({ provider: 'presto', is_active: true })
       │         └─ For each team (sequential):
       │              ├─ Check: team not already syncing
       │              ├─ prestoSyncService.syncAll(teamId)
       │              └─ SyncLog records result
       │
       └─ Live stats cron: "*/2 * * * *"
            └─ IntegrationCredential.findAll({ provider: 'presto', is_active: true })
                 └─ For each team:
                      ├─ prestoSyncService.getLiveEligibleGames(teamId)
                      ├─ If no games → skip (fast path)
                      └─ For each active game:
                           └─ prestoSyncService.syncLiveStats(teamId, gameId)
```

## Configuration

| Setting | Value | Where |
|---------|-------|-------|
| Full sync interval | Every 4 hours | Hardcoded in cron expression |
| Live stats interval | Every 2 minutes | Hardcoded in cron expression |
| Scope | All teams with active PrestoSports credentials | Queried from `integration_credentials` |
| Error handling | Log to SyncLog, continue to next team | In scheduler |

No new environment variables or database migrations needed.

## Testing Strategy

- Unit test `SyncScheduler` with mocked `prestoSyncService` and `IntegrationCredential`
- Test: scheduler starts/stops cleanly
- Test: skips teams already syncing (overlap guard)
- Test: handles sync errors without crashing
- Test: doesn't start in test environment
- Integration: verify SyncLog entries have `initiated_by: null` for automated syncs

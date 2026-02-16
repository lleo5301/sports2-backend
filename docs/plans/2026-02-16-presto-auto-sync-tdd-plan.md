# PrestoSports Auto-Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automate PrestoSports data syncing with an in-process scheduler — full sync every 4 hours, live stats polling every 2 minutes on game days.

**Architecture:** A `SyncScheduler` class using `node-cron` runs inside the Express process. Two cron jobs: full sync (roster/schedule/stats) and live stats poller. Started on server boot, stopped on SIGTERM/SIGINT. Never runs in test environment.

**Tech Stack:** `node-cron`, existing `prestoSyncService`, `IntegrationCredential` model, `SyncLog` model

**Design Doc:** `docs/plans/2026-02-16-presto-auto-sync-design.md`

---

## Existing Code Reference

| Component | File | Key Methods |
|-----------|------|-------------|
| Sync orchestrator | `src/services/prestoSyncService.js` | `syncAll(teamId, userId)`, `getLiveEligibleGames(teamId)`, `syncLiveStats(teamId, gameId, userId)` |
| Credentials model | `src/models/IntegrationCredential.js` | `findAll({ where: { provider, is_active } })`, constants: `PROVIDERS.PRESTO` |
| Sync audit log | `src/models/SyncLog.js` | `logStart(teamId, syncType, userId, endpoint, params)` — `userId=null` marks automated |
| Server startup | `src/server.js` | `startServer()` at line 146, graceful shutdown at lines 208-218 |
| Logger | `src/utils/logger.js` | `logger.info()`, `logger.warn()`, `logger.error()` |

---

### Task 1: Install node-cron dependency

**Files:**
- Modify: `package.json`

**Step 1: Install node-cron**

Run:
```bash
npm install node-cron
```

Expected: `node-cron` appears in `dependencies` in `package.json`.

**Step 2: Verify installation**

Run:
```bash
node -e "const cron = require('node-cron'); console.log('node-cron loaded, validate:', cron.validate('*/5 * * * *'));"
```

Expected: `node-cron loaded, validate: true`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add node-cron dependency for scheduled sync"
```

---

### Task 2: Write failing tests for SyncScheduler

**Files:**
- Create: `src/services/__tests__/syncScheduler.test.js`

**Step 1: Write the full test suite**

This test file mocks `node-cron`, `prestoSyncService`, `IntegrationCredential`, and `logger`. No database needed — pure unit tests.

```javascript
'use strict';

// Mock node-cron before requiring SyncScheduler
const mockSchedule = jest.fn();
const mockStop = jest.fn();
jest.mock('node-cron', () => ({
  schedule: mockSchedule
}));

// Mock prestoSyncService
const mockSyncAll = jest.fn();
const mockGetLiveEligibleGames = jest.fn();
const mockSyncLiveStats = jest.fn();
jest.mock('../../services/prestoSyncService', () => ({
  syncAll: mockSyncAll,
  getLiveEligibleGames: mockGetLiveEligibleGames,
  syncLiveStats: mockSyncLiveStats
}));

// Mock IntegrationCredential
const mockFindAll = jest.fn();
jest.mock('../../models/IntegrationCredential', () => ({
  findAll: mockFindAll,
  PROVIDERS: { PRESTO: 'presto' }
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const logger = require('../../utils/logger');

let SyncScheduler;

beforeEach(() => {
  jest.clearAllMocks();

  // Each call to cron.schedule returns a mock task with a stop method
  mockSchedule.mockReturnValue({ stop: mockStop });

  // Re-require to get fresh instance
  jest.isolateModules(() => {
    SyncScheduler = require('../../services/syncScheduler');
  });
});

describe('SyncScheduler', () => {
  describe('start()', () => {
    test('should schedule two cron jobs on start', () => {
      const scheduler = new SyncScheduler();
      scheduler.start();

      expect(mockSchedule).toHaveBeenCalledTimes(2);
      // Full sync: every 4 hours
      expect(mockSchedule).toHaveBeenCalledWith(
        '0 */4 * * *',
        expect.any(Function),
        expect.objectContaining({ scheduled: true })
      );
      // Live stats: every 2 minutes
      expect(mockSchedule).toHaveBeenCalledWith(
        '*/2 * * * *',
        expect.any(Function),
        expect.objectContaining({ scheduled: true })
      );
    });

    test('should log when starting', () => {
      const scheduler = new SyncScheduler();
      scheduler.start();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sync scheduler started')
      );
    });

    test('should not start twice', () => {
      const scheduler = new SyncScheduler();
      scheduler.start();
      scheduler.start();

      // Only 2 cron jobs total (not 4)
      expect(mockSchedule).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already running')
      );
    });
  });

  describe('stop()', () => {
    test('should stop all cron jobs', () => {
      const scheduler = new SyncScheduler();
      scheduler.start();
      scheduler.stop();

      // Two tasks, each has stop() called
      expect(mockStop).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sync scheduler stopped')
      );
    });

    test('should handle stop when not started', () => {
      const scheduler = new SyncScheduler();
      scheduler.stop();

      // Should not throw, stop is a no-op
      expect(mockStop).not.toHaveBeenCalled();
    });
  });

  describe('runFullSync()', () => {
    test('should sync all teams with active presto credentials', async () => {
      mockFindAll.mockResolvedValue([
        { team_id: 1 },
        { team_id: 2 }
      ]);
      mockSyncAll.mockResolvedValue({ success: true });

      const scheduler = new SyncScheduler();
      await scheduler.runFullSync();

      expect(mockFindAll).toHaveBeenCalledWith({
        where: { provider: 'presto', is_active: true },
        attributes: ['team_id']
      });
      expect(mockSyncAll).toHaveBeenCalledWith(1, null);
      expect(mockSyncAll).toHaveBeenCalledWith(2, null);
    });

    test('should process teams sequentially (not in parallel)', async () => {
      const callOrder = [];
      mockFindAll.mockResolvedValue([
        { team_id: 1 },
        { team_id: 2 }
      ]);
      mockSyncAll.mockImplementation(async (teamId) => {
        callOrder.push(`start-${teamId}`);
        await new Promise(resolve => setTimeout(resolve, 10));
        callOrder.push(`end-${teamId}`);
      });

      const scheduler = new SyncScheduler();
      await scheduler.runFullSync();

      // Sequential: start-1 must complete before start-2
      expect(callOrder).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    });

    test('should skip teams that are already syncing (overlap guard)', async () => {
      mockFindAll.mockResolvedValue([{ team_id: 1 }]);

      // Make syncAll take a long time
      let resolveSyncAll;
      mockSyncAll.mockImplementation(() => new Promise(resolve => {
        resolveSyncAll = resolve;
      }));

      const scheduler = new SyncScheduler();

      // Start first sync (will not resolve)
      const firstSync = scheduler.runFullSync();

      // Start second sync while first is still running
      await scheduler.runFullSync();

      // syncAll should only be called once (second was skipped)
      expect(mockSyncAll).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already syncing')
      );

      // Clean up
      resolveSyncAll();
      await firstSync;
    });

    test('should continue to next team if one fails', async () => {
      mockFindAll.mockResolvedValue([
        { team_id: 1 },
        { team_id: 2 }
      ]);
      mockSyncAll
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true });

      const scheduler = new SyncScheduler();
      await scheduler.runFullSync();

      // Both teams attempted
      expect(mockSyncAll).toHaveBeenCalledTimes(2);
      // Error logged for team 1
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('team 1'),
        expect.any(Error)
      );
      // Team 2 still synced
      expect(mockSyncAll).toHaveBeenCalledWith(2, null);
    });

    test('should pass null as userId for automated syncs', async () => {
      mockFindAll.mockResolvedValue([{ team_id: 1 }]);
      mockSyncAll.mockResolvedValue({ success: true });

      const scheduler = new SyncScheduler();
      await scheduler.runFullSync();

      expect(mockSyncAll).toHaveBeenCalledWith(1, null);
    });

    test('should handle no teams with active credentials', async () => {
      mockFindAll.mockResolvedValue([]);

      const scheduler = new SyncScheduler();
      await scheduler.runFullSync();

      expect(mockSyncAll).not.toHaveBeenCalled();
    });
  });

  describe('runLiveStatsSync()', () => {
    test('should check live games for each team', async () => {
      mockFindAll.mockResolvedValue([{ team_id: 1 }]);
      mockGetLiveEligibleGames.mockResolvedValue([
        { id: 10, opponent: 'Team A' },
        { id: 11, opponent: 'Team B' }
      ]);
      mockSyncLiveStats.mockResolvedValue({ success: true });

      const scheduler = new SyncScheduler();
      await scheduler.runLiveStatsSync();

      expect(mockGetLiveEligibleGames).toHaveBeenCalledWith(1);
      expect(mockSyncLiveStats).toHaveBeenCalledWith(1, 10, null);
      expect(mockSyncLiveStats).toHaveBeenCalledWith(1, 11, null);
    });

    test('should skip teams with no live games (fast path)', async () => {
      mockFindAll.mockResolvedValue([{ team_id: 1 }]);
      mockGetLiveEligibleGames.mockResolvedValue([]);

      const scheduler = new SyncScheduler();
      await scheduler.runLiveStatsSync();

      expect(mockSyncLiveStats).not.toHaveBeenCalled();
    });

    test('should continue if one team fails', async () => {
      mockFindAll.mockResolvedValue([
        { team_id: 1 },
        { team_id: 2 }
      ]);
      mockGetLiveEligibleGames
        .mockRejectedValueOnce(new Error('Auth failed'))
        .mockResolvedValueOnce([{ id: 20 }]);
      mockSyncLiveStats.mockResolvedValue({ success: true });

      const scheduler = new SyncScheduler();
      await scheduler.runLiveStatsSync();

      // Team 2 still checked
      expect(mockGetLiveEligibleGames).toHaveBeenCalledWith(2);
      expect(mockSyncLiveStats).toHaveBeenCalledWith(2, 20, null);
    });

    test('should skip teams already syncing', async () => {
      mockFindAll.mockResolvedValue([{ team_id: 1 }]);

      let resolveGames;
      mockGetLiveEligibleGames.mockImplementation(() => new Promise(resolve => {
        resolveGames = resolve;
      }));

      const scheduler = new SyncScheduler();

      // Start first live sync (won't resolve)
      const firstSync = scheduler.runLiveStatsSync();

      // Start second live sync while first is running
      await scheduler.runLiveStatsSync();

      expect(mockGetLiveEligibleGames).toHaveBeenCalledTimes(1);

      // Clean up
      resolveGames([]);
      await firstSync;
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- --testPathPattern="syncScheduler"
```

Expected: FAIL — `Cannot find module '../../services/syncScheduler'`

**Step 3: Commit the failing tests**

```bash
git add src/services/__tests__/syncScheduler.test.js
git commit -m "test: add SyncScheduler unit tests (red phase)"
```

---

### Task 3: Implement SyncScheduler service

**Files:**
- Create: `src/services/syncScheduler.js`

**Step 1: Write the SyncScheduler class**

```javascript
'use strict';

const cron = require('node-cron');
const logger = require('../utils/logger');
const prestoSyncService = require('./prestoSyncService');
const IntegrationCredential = require('../models/IntegrationCredential');

class SyncScheduler {
  constructor() {
    this.fullSyncTask = null;
    this.liveStatsTask = null;
    this.syncingTeams = new Set();
    this.running = false;
  }

  /**
   * Start both cron jobs
   */
  start() {
    if (this.running) {
      logger.warn('Sync scheduler already running — skipping start');
      return;
    }

    // Full sync: every 4 hours at :00
    this.fullSyncTask = cron.schedule('0 */4 * * *', () => {
      this.runFullSync().catch(err => {
        logger.error('Full sync cron error:', err);
      });
    }, { scheduled: true });

    // Live stats: every 2 minutes
    this.liveStatsTask = cron.schedule('*/2 * * * *', () => {
      this.runLiveStatsSync().catch(err => {
        logger.error('Live stats cron error:', err);
      });
    }, { scheduled: true });

    this.running = true;
    logger.info('Sync scheduler started — full sync every 4h, live stats every 2min');
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    if (this.fullSyncTask) {
      this.fullSyncTask.stop();
    }
    if (this.liveStatsTask) {
      this.liveStatsTask.stop();
    }

    this.running = false;
    logger.info('Sync scheduler stopped');
  }

  /**
   * Get all teams with active PrestoSports credentials
   */
  async getActivePrestoTeams() {
    return IntegrationCredential.findAll({
      where: {
        provider: IntegrationCredential.PROVIDERS.PRESTO,
        is_active: true
      },
      attributes: ['team_id']
    });
  }

  /**
   * Run full sync for all active teams (sequential)
   */
  async runFullSync() {
    const credentials = await this.getActivePrestoTeams();

    if (credentials.length === 0) {
      return;
    }

    logger.info(`Full sync starting for ${credentials.length} team(s)`);

    for (const cred of credentials) {
      const teamId = cred.team_id;

      if (this.syncingTeams.has(teamId)) {
        logger.warn(`Skipping full sync for team ${teamId} — already syncing`);
        continue;
      }

      this.syncingTeams.add(teamId);
      try {
        await prestoSyncService.syncAll(teamId, null);
        logger.info(`Full sync completed for team ${teamId}`);
      } catch (error) {
        logger.error(`Full sync failed for team ${teamId}:`, error);
      } finally {
        this.syncingTeams.delete(teamId);
      }
    }
  }

  /**
   * Check all active teams for live games and sync stats
   */
  async runLiveStatsSync() {
    const credentials = await this.getActivePrestoTeams();

    for (const cred of credentials) {
      const teamId = cred.team_id;

      if (this.syncingTeams.has(teamId)) {
        logger.warn(`Skipping live stats for team ${teamId} — already syncing`);
        continue;
      }

      this.syncingTeams.add(teamId);
      try {
        const games = await prestoSyncService.getLiveEligibleGames(teamId);

        if (games.length === 0) {
          continue;
        }

        logger.info(`Live stats: ${games.length} eligible game(s) for team ${teamId}`);

        for (const game of games) {
          try {
            await prestoSyncService.syncLiveStats(teamId, game.id, null);
          } catch (error) {
            logger.error(`Live stats failed for team ${teamId}, game ${game.id}:`, error);
          }
        }
      } catch (error) {
        logger.error(`Live stats check failed for team ${teamId}:`, error);
      } finally {
        this.syncingTeams.delete(teamId);
      }
    }
  }
}

module.exports = SyncScheduler;
```

**Step 2: Run tests to verify they pass**

Run:
```bash
npm test -- --testPathPattern="syncScheduler"
```

Expected: All tests PASS (14 tests).

**Step 3: Commit**

```bash
git add src/services/syncScheduler.js
git commit -m "feat: add SyncScheduler with full sync and live stats cron jobs"
```

---

### Task 4: Integrate scheduler into server.js

**Files:**
- Modify: `src/server.js` (lines 1-4 for require, lines 188-192 for start, lines 208-218 for shutdown)

**Step 1: Add scheduler import at top of server.js**

After line 5 (`const logger = require('./utils/logger');`), add:

```javascript
const SyncScheduler = require('./services/syncScheduler');
```

**Step 2: Start scheduler after Express is listening**

Replace lines 188-192:
```javascript
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
    });
```

With:
```javascript
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);

      // Start sync scheduler in production and development (not test)
      if (process.env.NODE_ENV !== 'test') {
        const syncScheduler = new SyncScheduler();
        syncScheduler.start();
        app.locals.syncScheduler = syncScheduler;
      }
    });
```

**Step 3: Update graceful shutdown handlers to stop scheduler**

Replace the SIGTERM handler (lines 208-212):
```javascript
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  await sequelize.close();
  process.exit(0); // eslint-disable-line no-process-exit
});
```

With:
```javascript
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  if (app.locals.syncScheduler) {
    app.locals.syncScheduler.stop();
  }
  await sequelize.close();
  process.exit(0); // eslint-disable-line no-process-exit
});
```

Replace the SIGINT handler (lines 214-218):
```javascript
process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  await sequelize.close();
  process.exit(0); // eslint-disable-line no-process-exit
});
```

With:
```javascript
process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  if (app.locals.syncScheduler) {
    app.locals.syncScheduler.stop();
  }
  await sequelize.close();
  process.exit(0); // eslint-disable-line no-process-exit
});
```

**Step 4: Verify existing tests still pass**

Run:
```bash
npm test
```

Expected: All existing tests PASS. The scheduler does NOT start during tests because `jest.setup.js` sets `NODE_ENV=test`.

**Step 5: Commit**

```bash
git add src/server.js
git commit -m "feat: integrate SyncScheduler into server startup and shutdown"
```

---

### Task 5: Manual smoke test

**Step 1: Verify scheduler starts in Docker**

Run:
```bash
docker restart sports2_backend && sleep 3 && docker logs sports2_backend --tail 20
```

Expected: Logs should include `Sync scheduler started — full sync every 4h, live stats every 2min` after the `Server running on port 5000` message.

**Step 2: Verify scheduler does NOT start in test mode**

Run:
```bash
npm test -- --testPathPattern="syncScheduler"
```

Expected: All tests pass, no scheduler log output.

**Step 3: Commit all changes (final)**

```bash
git add -A
git commit -m "feat: complete PrestoSports auto-sync scheduler

Adds node-cron-based scheduler that runs inside the Express process:
- Full sync (roster/schedule/stats) every 4 hours for all teams
- Live stats polling every 2 minutes on game days
- Overlap guard prevents duplicate syncs per team
- Graceful shutdown stops cron jobs on SIGTERM/SIGINT
- Skipped in test environment (NODE_ENV=test)
- Automated syncs use initiated_by=null in SyncLog"
```

---

## Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 1 | Install `node-cron` | `package.json` | — |
| 2 | Write failing tests | `src/services/__tests__/syncScheduler.test.js` | 14 tests (red) |
| 3 | Implement SyncScheduler | `src/services/syncScheduler.js` | 14 tests (green) |
| 4 | Integrate into server.js | `src/server.js` | Existing tests still pass |
| 5 | Smoke test in Docker | — | Manual verification |

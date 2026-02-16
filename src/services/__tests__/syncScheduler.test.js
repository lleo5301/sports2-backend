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

  // Re-require to get fresh class
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

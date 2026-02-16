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

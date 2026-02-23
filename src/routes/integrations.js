const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Team, IntegrationCredential, SyncLog, User } = require('../models');
const { protect } = require('../middleware/auth');
const prestoSportsService = require('../services/prestoSportsService');
const prestoSyncService = require('../services/prestoSyncService');
const integrationCredentialService = require('../services/integrationCredentialService');

const PROVIDER = IntegrationCredential.PROVIDERS.PRESTO;

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Check if user has permission to manage integrations (head_coach or above)
const checkIntegrationPermission = async (req, res, next) => {
  try {
    const user = req.user;
    if (!['head_coach', 'super_admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only head coaches can manage integrations'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking permissions'
    });
  }
};

// Get PrestoSports integration status
router.get('/presto/status', protect, async (req, res) => {
  try {
    const team = await Team.findByPk(req.user.team_id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Get integration status from credential service
    let integrationData = null;
    try {
      const { credentials, config, isTokenExpired } = await integrationCredentialService.getCredentials(req.user.team_id, PROVIDER);
      integrationData = {
        isConfigured: !!credentials,
        prestoTeamId: config?.team_id || null,
        prestoSeasonId: config?.season_id || null,
        lastSyncAt: team.presto_last_sync_at,
        tokenStatus: credentials ? (isTokenExpired ? 'expired' : 'valid') : null
      };
    } catch (_err) {
      // No credentials configured
      integrationData = {
        isConfigured: false,
        prestoTeamId: null,
        prestoSeasonId: null,
        lastSyncAt: null,
        tokenStatus: null
      };
    }

    res.json({
      success: true,
      data: integrationData
    });
  } catch (error) {
    console.error('Error getting PrestoSports status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting integration status'
    });
  }
});

// Configure PrestoSports credentials
router.post('/presto/configure',
  protect,
  checkIntegrationPermission,
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, password, prestoTeamId, prestoSeasonId } = req.body;

      // Test the credentials first
      const testResult = await prestoSportsService.testConnection(username, password);
      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Invalid credentials: ' + testResult.error
        });
      }

      // Save credentials using credential service
      await integrationCredentialService.saveCredentials(
        req.user.team_id,
        PROVIDER,
        { username, password },
        {
          team_id: prestoTeamId || null,
          season_id: prestoSeasonId || null
        },
        IntegrationCredential.CREDENTIAL_TYPES.BASIC
      );

      // If authentication returned tokens, save them (including refresh token)
      if (testResult.token?.idToken) {
        await integrationCredentialService.saveTokens(req.user.team_id, PROVIDER, {
          accessToken: testResult.token.idToken,
          refreshToken: testResult.token.refreshToken,
          expiresIn: testResult.token.expirationTimeInSeconds || 3600,
          // PrestoSports refresh tokens typically last 30 days
          refreshExpiresIn: 30 * 24 * 60 * 60
        });
      }

      res.json({
        success: true,
        message: 'PrestoSports configured successfully',
        data: {
          userInfo: testResult.userInfo
        }
      });
    } catch (error) {
      console.error('Error configuring PrestoSports:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error configuring PrestoSports'
      });
    }
  }
);

// Test PrestoSports connection
router.post('/presto/test',
  protect,
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, password } = req.body;

      const testResult = await prestoSportsService.testConnection(username, password);

      if (testResult.success) {
        res.json({
          success: true,
          message: 'Connection successful',
          data: {
            userInfo: testResult.userInfo
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: testResult.error
        });
      }
    } catch (error) {
      console.error('Error testing PrestoSports connection:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Connection test failed'
      });
    }
  }
);

// Disconnect PrestoSports
router.delete('/presto/disconnect', protect, checkIntegrationPermission, async (req, res) => {
  try {
    // Delete credentials from credential service
    await integrationCredentialService.deleteCredentials(req.user.team_id, PROVIDER);

    // Also clear any cached tokens
    prestoSportsService.clearCachedToken(req.user.team_id);

    // Update team's last sync time to null
    const team = await Team.findByPk(req.user.team_id);
    if (team) {
      await team.update({
        presto_last_sync_at: null
      });
    }

    res.json({
      success: true,
      message: 'PrestoSports disconnected'
    });
  } catch (error) {
    console.error('Error disconnecting PrestoSports:', error);
    res.status(500).json({
      success: false,
      message: 'Error disconnecting PrestoSports'
    });
  }
});

// Get available seasons
router.get('/presto/seasons', protect, async (req, res) => {
  try {
    const response = await prestoSyncService.makeAuthenticatedRequest(
      req.user.team_id, 'GET', '/me/seasons'
    );

    res.json({
      success: true,
      data: response.data || response || []
    });
  } catch (error) {
    console.error('Error getting PrestoSports seasons:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting seasons'
    });
  }
});

// Get teams for a season
router.get('/presto/seasons/:seasonId/teams', protect, async (req, res) => {
  try {
    const response = await prestoSyncService.makeAuthenticatedRequest(
      req.user.team_id, 'GET', `/seasons/${req.params.seasonId}/teams`
    );

    res.json({
      success: true,
      data: response.data || response || []
    });
  } catch (error) {
    console.error('Error getting PrestoSports teams:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting teams'
    });
  }
});

// Get user's accessible teams
router.get('/presto/teams', protect, async (req, res) => {
  try {
    const response = await prestoSyncService.makeAuthenticatedRequest(
      req.user.team_id, 'GET', '/me/teams'
    );

    res.json({
      success: true,
      data: response.data || response || []
    });
  } catch (error) {
    console.error('Error getting PrestoSports teams:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting teams'
    });
  }
});

// Update PrestoSports team/season selection
router.put('/presto/settings', protect, checkIntegrationPermission,
  [
    body('prestoTeamId').notEmpty().withMessage('PrestoSports team ID is required'),
    body('prestoSeasonId').notEmpty().withMessage('PrestoSports season ID is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { prestoTeamId, prestoSeasonId } = req.body;

      // Update config in credential service
      await integrationCredentialService.updateConfig(req.user.team_id, PROVIDER, {
        team_id: prestoTeamId,
        season_id: prestoSeasonId
      });

      res.json({
        success: true,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      console.error('Error updating PrestoSports settings:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error updating settings'
      });
    }
  }
);

// Sync schedule
router.post('/presto/sync/schedule', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncSchedule(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Schedule synced: ${results.created} created, ${results.updated} updated`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing schedule:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing schedule'
    });
  }
});

// Sync roster
router.post('/presto/sync/roster', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncRoster(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Roster synced: ${results.created} created, ${results.updated} updated`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing roster:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing roster'
    });
  }
});

// Sync stats
router.post('/presto/sync/stats', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const results = await prestoSyncService.syncStats(req.user.team_id, req.user.id, { force });

    res.json({
      success: true,
      message: `Stats synced: ${results.statsCreated} created, ${results.statsUpdated} updated from ${results.gamesProcessed} games`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing stats'
    });
  }
});

// Sync team record (W-L)
router.post('/presto/sync/record', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncTeamRecord(req.user.team_id);

    res.json({
      success: true,
      message: results.success ? 'Team record synced successfully' : 'Failed to sync team record',
      data: results
    });
  } catch (error) {
    console.error('Error syncing team record:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing team record'
    });
  }
});

// Sync season stats
router.post('/presto/sync/season-stats', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncSeasonStats(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Season stats synced: ${results.created} created, ${results.updated} updated`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing season stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing season stats'
    });
  }
});

// Sync career stats
router.post('/presto/sync/career-stats', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncCareerStats(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Career stats synced: ${results.created} created, ${results.updated} updated`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing career stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing career stats'
    });
  }
});

// Sync player details (bio, hometown, high school, etc.)
router.post('/presto/sync/player-details', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncPlayerDetails(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Player details synced: ${results.updated} updated, ${results.skipped} skipped`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing player details:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing player details'
    });
  }
});

// Sync player photos
router.post('/presto/sync/player-photos', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncPlayerPhotos(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Player photos synced: ${results.updated} updated, ${results.skipped} skipped`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing player photos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing player photos'
    });
  }
});

// Sync press releases/news
router.post('/presto/sync/press-releases', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncPressReleases(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Press releases synced: ${results.created} created, ${results.updated} updated`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing press releases:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing press releases'
    });
  }
});

// Sync historical season-by-season stats
router.post('/presto/sync/historical-stats', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncHistoricalSeasonStats(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Historical stats synced: ${results.created} created, ${results.updated} updated`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing historical stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing historical stats'
    });
  }
});

// Sync player videos/highlights
router.post('/presto/sync/player-videos', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncPlayerVideos(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Player videos synced: ${results.created} created, ${results.updated} updated`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing player videos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing player videos'
    });
  }
});

// Get games eligible for live stats (today's games or games with presto_event_id)
router.get('/presto/games/live', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const games = await prestoSyncService.getLiveEligibleGames(req.user.team_id);

    res.json({
      success: true,
      data: games,
      count: games.length
    });
  } catch (error) {
    console.error('Error getting live-eligible games:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting live-eligible games'
    });
  }
});

// Sync live stats for a specific game (real-time polling during games)
router.post('/presto/sync/live-stats/:gameId', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId, 10);
    if (isNaN(gameId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid game ID'
      });
    }

    const results = await prestoSyncService.syncLiveStats(req.user.team_id, gameId, req.user.id);

    if (!results.success) {
      return res.status(400).json({
        success: false,
        message: results.error || 'Failed to sync live stats',
        data: results
      });
    }

    res.json({
      success: true,
      message: `Live stats synced: ${results.statsCreated} created, ${results.statsUpdated} updated`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing live stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing live stats'
    });
  }
});

// Sync all
router.post('/presto/sync/all', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const force = req.body.force === true;
    const results = await prestoSyncService.syncAll(req.user.team_id, req.user.id, { force });

    const messages = [];
    if (results.roster) {
      messages.push(`Roster: ${results.roster.created} created, ${results.roster.updated} updated`);
    }
    if (results.schedule) {
      messages.push(`Schedule: ${results.schedule.created} created, ${results.schedule.updated} updated`);
    }
    if (results.stats) {
      messages.push(`Stats: ${results.stats.statsCreated} created, ${results.stats.statsUpdated} updated`);
    }
    if (results.teamRecord?.success) {
      messages.push(`Record: ${results.teamRecord.record.wins}-${results.teamRecord.record.losses}`);
    }
    if (results.seasonStats) {
      messages.push(`Season Stats: ${results.seasonStats.created} created, ${results.seasonStats.updated} updated`);
    }
    if (results.careerStats) {
      messages.push(`Career Stats: ${results.careerStats.created} created, ${results.careerStats.updated} updated`);
    }

    res.json({
      success: true,
      message: messages.join('; '),
      data: results
    });
  } catch (error) {
    console.error('Error syncing all:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing all'
    });
  }
});

// Presto API diagnostics — recent requests, stats, Cloudflare detections
router.get('/presto/diagnostics', protect, checkIntegrationPermission, async (_req, res) => {
  const diagnostics = prestoSportsService.getDiagnostics();
  res.json({ success: true, data: diagnostics });
});

// Sync opponent stats from box scores
router.post('/presto/sync/opponent-stats', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncOpponentStats(req.user.team_id, req.user.id);

    res.json({
      success: true,
      message: `Opponent stats synced: ${results.playersCreated} created, ${results.playersUpdated} updated from ${results.gamesProcessed} games`,
      data: results
    });
  } catch (error) {
    console.error('Error syncing opponent stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing opponent stats'
    });
  }
});

// Get all league teams with logos for the configured season
// Frontend uses this to display opponent logos in game lists, schedules, etc.
router.get('/presto/league-teams', protect, async (req, res) => {
  try {
    // Get configured season from integration credentials
    const { config } = await integrationCredentialService.getCredentials(
      req.user.team_id,
      PROVIDER
    );

    const seasonId = req.query.seasonId || config?.season_id;
    if (!seasonId) {
      return res.status(400).json({
        success: false,
        message: 'No season configured. Set up PrestoSports integration first.'
      });
    }

    const response = await prestoSyncService.makeAuthenticatedRequest(
      req.user.team_id, 'GET', `/seasons/${seasonId}/teams`
    );
    const teams = response.data || response || [];

    // Map to a clean, frontend-friendly format
    const leagueTeams = teams.map(t => ({
      teamId: t.teamId,
      name: t.teamName || t.name || null,
      logo: t.logo || t.logoUrl || null,
      conference: t.conference || null,
      division: t.division || null,
    }));

    res.json({
      success: true,
      data: leagueTeams,
      count: leagueTeams.length,
      seasonId
    });
  } catch (error) {
    console.error('Error getting league teams:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting league teams'
    });
  }
});

// Get sync audit log / history
router.get('/presto/sync/history', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sync_type,
      status
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const where = { team_id: req.user.team_id };
    if (sync_type) where.sync_type = sync_type;
    if (status) where.status = status;

    const { rows, count } = await SyncLog.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'initiator',
        attributes: ['id', 'first_name', 'last_name', 'email']
      }],
      order: [['started_at', 'DESC']],
      limit: limitNum,
      offset
    });

    const logs = rows.map(log => ({
      id: log.id,
      sync_type: log.sync_type,
      status: log.status,
      trigger: log.initiated_by ? 'manual' : 'scheduled',
      triggered_by: log.initiator
        ? `${log.initiator.first_name} ${log.initiator.last_name}`
        : null,
      started_at: log.started_at,
      completed_at: log.completed_at,
      duration_ms: log.duration_ms,
      items_created: log.items_created,
      items_updated: log.items_updated,
      items_skipped: log.items_skipped,
      items_failed: log.items_failed,
      error_message: log.error_message,
      response_summary: log.response_summary
    }));

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching sync history:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching sync history'
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Team } = require('../models');
const { protect } = require('../middleware/auth');
const encryptionService = require('../services/encryptionService');
const prestoSportsService = require('../services/prestoSportsService');
const prestoSyncService = require('../services/prestoSyncService');

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

    const isConfigured = !!team.presto_credentials;

    res.json({
      success: true,
      data: {
        isConfigured,
        prestoTeamId: team.presto_team_id,
        prestoSeasonId: team.presto_season_id,
        lastSyncAt: team.presto_last_sync_at
      }
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

      // Encrypt and save credentials
      const encryptedCredentials = encryptionService.encrypt({
        username,
        password
      });

      const team = await Team.findByPk(req.user.team_id);
      await team.update({
        presto_credentials: encryptedCredentials,
        presto_team_id: prestoTeamId || null,
        presto_season_id: prestoSeasonId || null
      });

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
    const team = await Team.findByPk(req.user.team_id);
    await team.update({
      presto_credentials: null,
      presto_team_id: null,
      presto_season_id: null,
      presto_last_sync_at: null
    });

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
    const token = await prestoSyncService.getToken(req.user.team_id);
    const response = await prestoSportsService.getSeasons(token);

    res.json({
      success: true,
      data: response.data || []
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
    const token = await prestoSyncService.getToken(req.user.team_id);
    const response = await prestoSportsService.getSeasonTeams(token, req.params.seasonId);

    res.json({
      success: true,
      data: response.data || []
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
    const token = await prestoSyncService.getToken(req.user.team_id);
    const response = await prestoSportsService.getUserTeams(token);

    res.json({
      success: true,
      data: response.data || []
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

      const team = await Team.findByPk(req.user.team_id);
      await team.update({
        presto_team_id: prestoTeamId,
        presto_season_id: prestoSeasonId
      });

      res.json({
        success: true,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      console.error('Error updating PrestoSports settings:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating settings'
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
    const results = await prestoSyncService.syncStats(req.user.team_id, req.user.id);

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

// Sync all
router.post('/presto/sync/all', protect, checkIntegrationPermission, async (req, res) => {
  try {
    const results = await prestoSyncService.syncAll(req.user.team_id, req.user.id);

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

module.exports = router;

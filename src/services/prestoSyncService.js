const { Game, Player, GameStatistic, Team } = require('../models');
const prestoSportsService = require('./prestoSportsService');
const encryptionService = require('./encryptionService');

class PrestoSyncService {
  /**
   * Get decrypted credentials for a team
   */
  async getCredentials(teamId) {
    const team = await Team.findByPk(teamId);
    if (!team || !team.presto_credentials) {
      throw new Error('PrestoSports not configured for this team');
    }

    try {
      return encryptionService.decrypt(team.presto_credentials);
    } catch (error) {
      throw new Error('Failed to decrypt credentials');
    }
  }

  /**
   * Get an authenticated token for a team
   */
  async getToken(teamId) {
    // Check cache first
    const cached = prestoSportsService.getCachedToken(teamId);
    if (cached) {
      return cached.idToken;
    }

    // Get credentials and authenticate
    const credentials = await this.getCredentials(teamId);
    const authResult = await prestoSportsService.authenticate(
      credentials.username,
      credentials.password
    );

    // Cache the token
    prestoSportsService.cacheToken(teamId, authResult);

    return authResult.idToken;
  }

  /**
   * Map PrestoSports position to local position enum
   */
  mapPosition(prestoPosition) {
    const positionMap = {
      'P': 'P',
      'C': 'C',
      '1B': '1B',
      '2B': '2B',
      '3B': '3B',
      'SS': 'SS',
      'LF': 'LF',
      'CF': 'CF',
      'RF': 'RF',
      'OF': 'OF',
      'DH': 'DH',
      'INF': 'SS',  // Default infielder to SS
      'UT': 'OF',   // Utility to OF
      'PH': 'DH',   // Pinch hitter to DH
      'PR': 'OF'    // Pinch runner to OF
    };

    return positionMap[prestoPosition?.toUpperCase()] || 'OF';
  }

  /**
   * Map PrestoSports class year to local enum
   */
  mapClassYear(prestoClass) {
    const classMap = {
      'FR': 'FR',
      'FRESHMAN': 'FR',
      'SO': 'SO',
      'SOPHOMORE': 'SO',
      'JR': 'JR',
      'JUNIOR': 'JR',
      'SR': 'SR',
      'SENIOR': 'SR',
      'GR': 'GR',
      'GRADUATE': 'GR',
      'RS-FR': 'FR',
      'RS-SO': 'SO',
      'RS-JR': 'JR',
      'RS-SR': 'SR'
    };

    return classMap[prestoClass?.toUpperCase()] || null;
  }

  /**
   * Parse height string (e.g., "6-2" or "6'2\"") to standardized format
   */
  parseHeight(heightStr) {
    if (!heightStr) return null;

    // Handle formats like "6-2", "6'2", "6'2\"", "6 2"
    const match = heightStr.match(/(\d+)['\-\s]+(\d+)/);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }

    return heightStr;
  }

  /**
   * Determine game result from scores
   */
  determineResult(teamScore, opponentScore) {
    if (teamScore === null || opponentScore === null) return null;
    if (teamScore > opponentScore) return 'W';
    if (teamScore < opponentScore) return 'L';
    return 'T';
  }

  /**
   * Sync roster (players) from PrestoSports
   */
  async syncRoster(teamId, userId) {
    const team = await Team.findByPk(teamId);
    if (!team.presto_team_id) {
      throw new Error('PrestoSports team ID not configured');
    }

    const token = await this.getToken(teamId);
    const response = await prestoSportsService.getTeamPlayers(token, team.presto_team_id);

    const players = response.data || [];
    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    for (const prestoPlayer of players) {
      try {
        const playerData = {
          first_name: prestoPlayer.firstName || prestoPlayer.first_name,
          last_name: prestoPlayer.lastName || prestoPlayer.last_name,
          position: this.mapPosition(prestoPlayer.position),
          height: this.parseHeight(prestoPlayer.height),
          weight: prestoPlayer.weight ? parseInt(prestoPlayer.weight) : null,
          jersey_number: prestoPlayer.jerseyNumber || prestoPlayer.jersey_number,
          class_year: this.mapClassYear(prestoPlayer.classYear || prestoPlayer.class_year),
          school: prestoPlayer.school || team.name,
          school_type: 'COLL',
          status: 'active',
          external_id: String(prestoPlayer.id || prestoPlayer.playerId),
          source_system: 'presto',
          last_synced_at: new Date(),
          team_id: teamId,
          created_by: userId
        };

        // Upsert by external_id
        const [player, created] = await Player.upsert(playerData, {
          returning: true
        });

        if (created) {
          results.created++;
        } else {
          results.updated++;
        }
      } catch (error) {
        results.errors.push({
          player: `${prestoPlayer.firstName} ${prestoPlayer.lastName}`,
          error: error.message
        });
      }
    }

    // Update team's last sync time
    await team.update({ presto_last_sync_at: new Date() });

    return results;
  }

  /**
   * Sync schedule (games/events) from PrestoSports
   */
  async syncSchedule(teamId, userId) {
    const team = await Team.findByPk(teamId);
    if (!team.presto_team_id) {
      throw new Error('PrestoSports team ID not configured');
    }

    const token = await this.getToken(teamId);
    const response = await prestoSportsService.getTeamEvents(token, team.presto_team_id);

    const events = response.data || [];
    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    for (const event of events) {
      try {
        // Determine opponent and home/away
        let opponent, homeAway;
        if (event.homeTeam && event.awayTeam) {
          if (event.homeTeam.id === team.presto_team_id || event.homeTeam.name?.includes(team.name)) {
            opponent = event.awayTeam.name || event.awayTeam.displayName;
            homeAway = 'home';
          } else {
            opponent = event.homeTeam.name || event.homeTeam.displayName;
            homeAway = 'away';
          }
        } else {
          opponent = event.opponent || event.opponentName || 'TBD';
          homeAway = event.homeAway?.toLowerCase() === 'home' ? 'home' : 'away';
        }

        // Parse scores
        let teamScore = null;
        let opponentScore = null;

        if (event.result || event.score) {
          const scoreData = event.result || event.score;
          if (homeAway === 'home') {
            teamScore = scoreData.homeScore ?? scoreData.teamScore ?? null;
            opponentScore = scoreData.awayScore ?? scoreData.opponentScore ?? null;
          } else {
            teamScore = scoreData.awayScore ?? scoreData.teamScore ?? null;
            opponentScore = scoreData.homeScore ?? scoreData.opponentScore ?? null;
          }
        }

        const gameData = {
          opponent: opponent,
          game_date: new Date(event.date || event.eventDate),
          game_time: event.time || event.startTime || null,
          home_away: homeAway,
          team_score: teamScore,
          opponent_score: opponentScore,
          result: this.determineResult(teamScore, opponentScore),
          location: event.location || event.venue || null,
          season: event.season || team.presto_season_id || null,
          game_status: this.mapEventStatus(event.status),
          external_id: String(event.id || event.eventId),
          source_system: 'presto',
          last_synced_at: new Date(),
          team_id: teamId,
          created_by: userId
        };

        // Find existing game by external_id
        const existingGame = await Game.findOne({
          where: { external_id: gameData.external_id }
        });

        if (existingGame) {
          await existingGame.update(gameData);
          results.updated++;
        } else {
          await Game.create(gameData);
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          event: event.id || event.eventId,
          error: error.message
        });
      }
    }

    // Update team's last sync time
    await team.update({ presto_last_sync_at: new Date() });

    return results;
  }

  /**
   * Map event status to local enum
   */
  mapEventStatus(status) {
    const statusMap = {
      'SCHEDULED': 'scheduled',
      'FINAL': 'completed',
      'COMPLETED': 'completed',
      'CANCELLED': 'cancelled',
      'CANCELED': 'cancelled',
      'POSTPONED': 'postponed',
      'IN_PROGRESS': 'scheduled'
    };

    return statusMap[status?.toUpperCase()] || 'scheduled';
  }

  /**
   * Sync game statistics from PrestoSports
   */
  async syncStats(teamId, userId) {
    const team = await Team.findByPk(teamId);
    if (!team.presto_team_id) {
      throw new Error('PrestoSports team ID not configured');
    }

    const token = await this.getToken(teamId);

    // Get all games synced from PrestoSports
    const games = await Game.findAll({
      where: {
        team_id: teamId,
        source_system: 'presto',
        game_status: 'completed'
      }
    });

    const results = {
      gamesProcessed: 0,
      statsCreated: 0,
      statsUpdated: 0,
      errors: []
    };

    for (const game of games) {
      try {
        const statsResponse = await prestoSportsService.getEventStats(token, game.external_id);
        const eventStats = statsResponse.data || {};

        // Process player stats for this game
        const playerStats = eventStats.players || eventStats.playerStats || [];

        for (const stat of playerStats) {
          try {
            // Find the player by external_id
            const player = await Player.findOne({
              where: {
                external_id: String(stat.playerId || stat.id),
                team_id: teamId
              }
            });

            if (!player) {
              // Skip stats for players not in our roster
              continue;
            }

            const statData = {
              game_id: game.id,
              player_id: player.id,
              team_id: teamId,
              external_id: `${game.external_id}-${stat.playerId || stat.id}`,
              source_system: 'presto',
              last_synced_at: new Date(),
              position_played: stat.position || null,

              // Batting stats
              at_bats: stat.ab ?? stat.atBats ?? 0,
              runs: stat.r ?? stat.runs ?? 0,
              hits: stat.h ?? stat.hits ?? 0,
              doubles: stat.doubles ?? stat['2b'] ?? 0,
              triples: stat.triples ?? stat['3b'] ?? 0,
              home_runs: stat.hr ?? stat.homeRuns ?? 0,
              rbi: stat.rbi ?? 0,
              walks: stat.bb ?? stat.walks ?? 0,
              strikeouts_batting: stat.so ?? stat.strikeouts ?? 0,
              stolen_bases: stat.sb ?? stat.stolenBases ?? 0,
              caught_stealing: stat.cs ?? stat.caughtStealing ?? 0,
              hit_by_pitch: stat.hbp ?? 0,
              sacrifice_flies: stat.sf ?? 0,
              sacrifice_bunts: stat.sac ?? stat.sh ?? 0,

              // Pitching stats
              innings_pitched: stat.ip ?? stat.inningsPitched ?? 0,
              hits_allowed: stat.ha ?? stat.hitsAllowed ?? 0,
              runs_allowed: stat.ra ?? stat.runsAllowed ?? 0,
              earned_runs: stat.er ?? stat.earnedRuns ?? 0,
              walks_allowed: stat.bbp ?? stat.walksAllowed ?? 0,
              strikeouts_pitching: stat.kp ?? stat.strikeoutsPitching ?? 0,
              home_runs_allowed: stat.hra ?? stat.homeRunsAllowed ?? 0,
              batters_faced: stat.bf ?? stat.battersFaced ?? 0,
              pitches_thrown: stat.pc ?? stat.pitchCount ?? 0,
              strikes_thrown: stat.st ?? stat.strikes ?? 0,
              win: stat.w === 1 || stat.win === true,
              loss: stat.l === 1 || stat.loss === true,
              save: stat.sv === 1 || stat.save === true,
              hold: stat.hld === 1 || stat.hold === true,

              // Fielding stats
              putouts: stat.po ?? stat.putouts ?? 0,
              assists: stat.a ?? stat.assists ?? 0,
              errors: stat.e ?? stat.errors ?? 0
            };

            // Upsert the stat record
            const [gameStat, created] = await GameStatistic.upsert(statData, {
              returning: true
            });

            if (created) {
              results.statsCreated++;
            } else {
              results.statsUpdated++;
            }
          } catch (error) {
            results.errors.push({
              game: game.id,
              player: stat.playerId,
              error: error.message
            });
          }
        }

        results.gamesProcessed++;
      } catch (error) {
        results.errors.push({
          game: game.id,
          error: error.message
        });
      }
    }

    // Update team's last sync time
    await team.update({ presto_last_sync_at: new Date() });

    return results;
  }

  /**
   * Sync everything (roster, schedule, stats)
   */
  async syncAll(teamId, userId) {
    const results = {
      roster: null,
      schedule: null,
      stats: null,
      errors: []
    };

    try {
      results.roster = await this.syncRoster(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'roster', error: error.message });
    }

    try {
      results.schedule = await this.syncSchedule(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'schedule', error: error.message });
    }

    try {
      results.stats = await this.syncStats(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'stats', error: error.message });
    }

    return results;
  }
}

module.exports = new PrestoSyncService();

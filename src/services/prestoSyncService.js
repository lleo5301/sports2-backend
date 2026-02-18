const { Op } = require('sequelize');
const { Game, Player, GameStatistic, Team, PlayerSeasonStats, PlayerCareerStats, SyncLog, IntegrationCredential, NewsRelease, PlayerVideo } = require('../models');
const prestoSportsService = require('./prestoSportsService');
const integrationCredentialService = require('./integrationCredentialService');

const PROVIDER = IntegrationCredential.PROVIDERS.PRESTO;

class PrestoSyncService {
  /**
   * Get decrypted credentials for a team using the new credential service
   */
  async getCredentials(teamId) {
    const { credentials, config } = await integrationCredentialService.getCredentials(teamId, PROVIDER);

    if (!credentials) {
      throw new Error('PrestoSports not configured for this team');
    }

    return {
      ...credentials,
      teamId: config?.team_id,
      seasonId: config?.season_id
    };
  }

  /**
   * Get an authenticated token for a team with auto-refresh support
   */
  async getToken(teamId) {
    // Check cache first (still use in-memory cache for performance)
    const cached = prestoSportsService.getCachedToken(teamId);
    if (cached) {
      return cached.idToken;
    }

    // Try to get existing token from credential store
    const { accessToken, isTokenExpired, credentials, credential } =
      await integrationCredentialService.getCredentials(teamId, PROVIDER);

    // If we have a valid stored token, use it
    if (accessToken && !isTokenExpired) {
      // Cache it in memory for subsequent calls
      prestoSportsService.cacheToken(teamId, { idToken: accessToken });
      return accessToken;
    }

    // Token is expired - try refresh first if we have a refresh token
    if (isTokenExpired && credential?.refresh_token_encrypted) {
      try {
        const result = await integrationCredentialService.refreshTokenIfNeeded(
          teamId,
          PROVIDER,
          async (refreshToken) => {
            const refreshResult = await prestoSportsService.refreshToken(refreshToken);
            return {
              accessToken: refreshResult.idToken,
              refreshToken: refreshResult.refreshToken,
              expiresIn: refreshResult.expirationTimeInSeconds || 3600
            };
          }
        );

        if (result.accessToken) {
          // Cache in memory for performance
          prestoSportsService.cacheToken(teamId, { idToken: result.accessToken });
          return result.accessToken;
        }
      } catch (refreshError) {
        // Refresh failed - fall through to re-authenticate
        console.warn(`Token refresh failed for team ${teamId}, will re-authenticate:`, refreshError.message);
      }
    }

    // No valid token and refresh failed/unavailable - authenticate fresh
    if (!credentials) {
      throw new Error('PrestoSports credentials not configured for this team');
    }

    const authResult = await prestoSportsService.authenticate(
      credentials.username,
      credentials.password
    );

    // Save both access and refresh tokens to the credential store
    await integrationCredentialService.saveTokens(teamId, PROVIDER, {
      accessToken: authResult.idToken,
      refreshToken: authResult.refreshToken,
      expiresIn: authResult.expirationTimeInSeconds || 3600,
      // PrestoSports refresh tokens typically last much longer (e.g., 30 days)
      refreshExpiresIn: 30 * 24 * 60 * 60
    });

    // Also cache in memory for performance
    prestoSportsService.cacheToken(teamId, authResult);

    return authResult.idToken;
  }

  /**
   * Get Presto config (team_id, season_id) from integration credentials
   */
  async getPrestoConfig(teamId) {
    const { config } = await integrationCredentialService.getCredentials(teamId, PROVIDER);
    return {
      prestoTeamId: config?.team_id,
      prestoSeasonId: config?.season_id
    };
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
    if (!heightStr) {
      return null;
    }

    // Handle formats like "6-2", "6'2", "6'2\"", "6 2"
    const match = heightStr.match(/(\d+)['\-\s]+(\d+)/);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }

    return heightStr;
  }

  /**
   * Safely get numeric value from a field
   */
  safeNumber(val) {
    if (val === null || val === undefined) {
      return 0;
    }
    if (typeof val === 'number') {
      return val;
    }
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? 0 : parsed;
    }
    // If it's an object or array, return 0
    return 0;
  }

  /**
   * Aggregate career stats from an array of season stats
   */
  aggregateCareerStats(seasonEntries) {
    if (!Array.isArray(seasonEntries) || seasonEntries.length === 0) {
      return null;
    }

    // Extract nested stats — handle both players[] array and player object formats
    const statsList = seasonEntries
      .map(entry => {
        // players[] array format (career-by-season endpoint)
        if (entry?.players?.length) {
          return entry.players[0]?.stats;
        }
        // player object format
        if (entry?.player?.stats) {
          return entry.player.stats;
        }
        // flat stats
        return entry?.stats || entry;
      })
      .filter(s => s && typeof s === 'object');

    if (statsList.length === 0) {
      return null;
    }

    const sumField = (field) => {
      return statsList.reduce((sum, s) => {
        return sum + this.safeNumber(s?.[field]);
      }, 0);
    };

    const aggregated = {
      seasonsPlayed: seasonEntries.length,
      gp: sumField('gp'),
      ab: sumField('ab'),
      r: sumField('r'),
      h: sumField('h'),
      '2b': sumField('dsk') || sumField('2b'),
      '3b': sumField('3b'),
      hr: sumField('hr'),
      rbi: sumField('rbi'),
      bb: sumField('bb'),
      k: sumField('k'),
      sb: sumField('sb'),
      pgp: sumField('pgp'),
      ip: sumField('ip'),
      pw: sumField('pw'),
      pl: sumField('pl'),
      sv: sumField('sv'),
      er: sumField('er'),
      pk: sumField('pk')
    };

    // Calculate career averages from aggregated totals
    if (aggregated.ab > 0) {
      aggregated.avg = (aggregated.h / aggregated.ab).toFixed(3);
    }
    const ip = parseFloat(aggregated.ip) || 0;
    if (ip > 0) {
      aggregated.era = ((aggregated.er * 9) / ip).toFixed(2);
    }

    return aggregated;
  }

  /**
   * Determine game result from scores
   */
  determineResult(teamScore, opponentScore) {
    if (teamScore === null || opponentScore === null) {
      return null;
    }
    if (teamScore > opponentScore) {
      return 'W';
    }
    if (teamScore < opponentScore) {
      return 'L';
    }
    return 'T';
  }

  /**
   * Sync roster (players) from PrestoSports
   */
  async syncRoster(teamId, userId) {
    const { prestoTeamId, prestoSeasonId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/v2/teams/${prestoTeamId}/players`;
    const syncLog = await SyncLog.logStart(teamId, 'roster', userId, endpoint, {
      presto_team_id: prestoTeamId,
      presto_season_id: prestoSeasonId
    });

    try {
      const token = await this.getToken(teamId);
      const team = await Team.findByPk(teamId);
      const response = await prestoSportsService.getTeamPlayers(token, prestoTeamId);

      const players = response.data || [];
      const results = {
        created: 0,
        updated: 0,
        errors: []
      };

      for (const prestoPlayer of players) {
        try {
          const prestoPlayerId = String(prestoPlayer.id || prestoPlayer.playerId);
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
            presto_player_id: prestoPlayerId,  // Explicit PrestoSports ID tracking
            external_id: prestoPlayerId,
            source_system: 'presto',
            last_synced_at: new Date(),
            team_id: teamId,
            created_by: userId
          };

          // Find existing player by external_id and update, or create new
          const existingPlayer = await Player.findOne({
            where: { external_id: prestoPlayerId, team_id: teamId }
          });

          if (existingPlayer) {
            await existingPlayer.update(playerData);
            results.updated++;
          } else {
            await Player.create(playerData);
            results.created++;
          }
        } catch (error) {
          results.errors.push({
            item_id: prestoPlayer.id || prestoPlayer.playerId,
            item_type: 'player',
            name: `${prestoPlayer.firstName} ${prestoPlayer.lastName}`,
            error: error.message
          });
        }
      }

      // Update team's last sync time
      await team.update({ presto_last_sync_at: new Date() });

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: results.created,
        updated: results.updated,
        failed: results.errors.length,
        summary: { players_processed: players.length },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Sync schedule (games/events) from PrestoSports
   */
  async syncSchedule(teamId, userId) {
    const { prestoTeamId, prestoSeasonId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/v2/teams/${prestoTeamId}/events`;
    const syncLog = await SyncLog.logStart(teamId, 'schedule', userId, endpoint, {
      presto_team_id: prestoTeamId,
      presto_season_id: prestoSeasonId
    });

    try {
      const token = await this.getToken(teamId);
      const team = await Team.findByPk(teamId);
      const response = await prestoSportsService.getTeamEvents(token, prestoTeamId);

      const events = response.data || response || [];
      const results = {
        created: 0,
        updated: 0,
        errors: []
      };

      for (const event of events) {
        try {
          // PrestoSports returns teams nested under event.teams
          const homeTeam = event.teams?.homeTeam || event.homeTeam;
          const awayTeam = event.teams?.awayTeam || event.awayTeam;

          // Determine opponent and home/away using teamId
          let opponent, homeAway;
          if (homeTeam && awayTeam) {
            // Check if our team is home or away using teamId
            if (homeTeam.teamId === prestoTeamId || homeTeam.teamName?.includes(team.name)) {
              opponent = awayTeam.teamName || awayTeam.name || 'TBD';
              homeAway = 'home';
            } else {
              opponent = homeTeam.teamName || homeTeam.name || 'TBD';
              homeAway = 'away';
            }
          } else {
            opponent = event.opponent || event.opponentName || 'TBD';
            homeAway = event.homeAway?.toLowerCase() === 'home' ? 'home' : 'away';
          }

          // Parse scores - PrestoSports returns score.home and score.away as strings
          let teamScore = null;
          let opponentScore = null;

          if (event.score) {
            const homeScore = event.score.home !== '' ? parseInt(event.score.home, 10) : null;
            const awayScore = event.score.away !== '' ? parseInt(event.score.away, 10) : null;
            if (homeAway === 'home') {
              teamScore = !isNaN(homeScore) ? homeScore : null;
              opponentScore = !isNaN(awayScore) ? awayScore : null;
            } else {
              teamScore = !isNaN(awayScore) ? awayScore : null;
              opponentScore = !isNaN(homeScore) ? homeScore : null;
            }
          } else if (event.result) {
            const scoreData = event.result;
            if (homeAway === 'home') {
              teamScore = scoreData.homeScore ?? scoreData.teamScore ?? null;
              opponentScore = scoreData.awayScore ?? scoreData.opponentScore ?? null;
            } else {
              teamScore = scoreData.awayScore ?? scoreData.teamScore ?? null;
              opponentScore = scoreData.homeScore ?? scoreData.opponentScore ?? null;
            }
          }

          // Parse date safely - PrestoSports uses startDateTime field
          const rawDate = event.startDateTime || event.date || event.eventDate;
          let gameDate = null;
          let gameTime = null;
          if (rawDate) {
            const parsed = new Date(rawDate);
            if (!isNaN(parsed.getTime())) {
              gameDate = parsed;
              // Extract time portion for game_time field
              gameTime = parsed.toTimeString().slice(0, 5); // "HH:MM" format
            }
          }

          // Handle TBA games
          if (event.tba === true) {
            gameDate = null;
            gameTime = null;
          }

          const prestoEventId = String(event.eventId || event.id);

          // Determine game status - if we have scores, the game is completed
          let gameStatus = this.mapEventStatus(event.status || event.statusCode);
          if (teamScore !== null && opponentScore !== null) {
            gameStatus = 'completed';
          }

          const gameData = {
            opponent,
            game_date: gameDate,
            game_time: gameTime || event.time || event.startTime || null,
            home_away: homeAway,
            team_score: teamScore,
            opponent_score: opponentScore,
            result: this.determineResult(teamScore, opponentScore),
            location: event.location || event.venue || null,
            season: event.seasonId || event.season || prestoSeasonId || null,
            game_status: gameStatus,
            // Enhanced game details
            attendance: event.attendance || null,
            weather: event.weather || null,
            game_duration: event.duration || event.gameDuration || null,
            // Source tracking
            presto_event_id: prestoEventId,  // Explicit PrestoSports ID tracking
            external_id: prestoEventId,
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
            item_id: event.id || event.eventId,
            item_type: 'game',
            error: error.message
          });
        }
      }

      // Update team's last sync time
      await team.update({ presto_last_sync_at: new Date() });

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: results.created,
        updated: results.updated,
        failed: results.errors.length,
        summary: { games_processed: events.length },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Map event status to local enum
   * PrestoSports uses statusCode: -2 (Not Started), -1 (In Progress), 0+ (Final)
   * And status strings like "Not Started", "Final", etc.
   */
  mapEventStatus(status) {
    // Handle numeric status codes from PrestoSports
    if (typeof status === 'number') {
      if (status === -2) {
        return 'scheduled'; // Not Started
      }
      if (status === -1) {
        return 'scheduled'; // In Progress (we don't have 'in_progress' enum)
      }
      if (status >= 0) {
        return 'completed'; // Final
      }
    }

    // Handle string statuses
    const statusStr = String(status || '').toUpperCase();
    const statusMap = {
      'NOT STARTED': 'scheduled',
      'SCHEDULED': 'scheduled',
      'IN PROGRESS': 'scheduled',
      'IN_PROGRESS': 'scheduled',
      'FINAL': 'completed',
      'COMPLETED': 'completed',
      'CANCELLED': 'cancelled',
      'CANCELED': 'cancelled',
      'POSTPONED': 'postponed'
    };

    return statusMap[statusStr] || 'scheduled';
  }

  /**
   * Parse PrestoSports XML box score to extract player stats
   * XML format:
   * <player playerId="xxx" name="Name" pos="dh">
   *   <hitting ab="5" r="0" h="1" rbi="1" ...></hitting>
   *   <fielding po="0" a="0" e="0" ...></fielding>
   *   <pitching ip="6.0" h="4" r="2" er="1" bb="2" so="5" ...></pitching>
   * </player>
   * @param {string} xml - XML string from PrestoSports
   * @returns {Array} Array of player stat objects
   */
  parseBoxScoreXml(xml) {
    const playerStats = [];

    try {
      // Match player elements: <player ...attributes...>...content...</player>
      const playerRegex = /<player\s+([^>]+)>([\s\S]*?)<\/player>/gi;

      let playerMatch;
      while ((playerMatch = playerRegex.exec(xml)) !== null) {
        const playerAttrs = playerMatch[1];
        const playerContent = playerMatch[2];

        // Parse player attributes (playerId, name, pos, uni)
        const player = this.parseXmlAttributes('<player ' + playerAttrs + '>');

        if (!player.playerId) {
          continue; // Skip if no playerId
        }

        const stats = {
          playerId: player.playerId,
          name: player.name || player.shortname,
          position: player.pos || player.atpos,
          jerseyNumber: player.uni
        };

        // Parse <hitting> element attributes
        const hittingMatch = playerContent.match(/<hitting\s+([^>]+)>/i);
        if (hittingMatch) {
          const hitting = this.parseXmlAttributes('<hitting ' + hittingMatch[1] + '>');
          stats.ab = hitting.ab;
          stats.r = hitting.r;
          stats.h = hitting.h;
          stats.rbi = hitting.rbi;
          stats.double = hitting.double;
          stats.triple = hitting.triple;
          stats.hr = hitting.hr;
          stats.bb = hitting.bb;
          stats.so = hitting.so;
          stats.sb = hitting.sb;
          stats.cs = hitting.cs;
          stats.hbp = hitting.hbp;
          stats.sf = hitting.sf;
          stats.sh = hitting.sh;
        }

        // Parse <fielding> element attributes
        const fieldingMatch = playerContent.match(/<fielding\s+([^>]+)>/i);
        if (fieldingMatch) {
          const fielding = this.parseXmlAttributes('<fielding ' + fieldingMatch[1] + '>');
          stats.po = fielding.po;
          stats.a = fielding.a;
          stats.e = fielding.e;
        }

        // Parse <pitching> element attributes
        const pitchingMatch = playerContent.match(/<pitching\s+([^>]+)>/i);
        if (pitchingMatch) {
          const pitching = this.parseXmlAttributes('<pitching ' + pitchingMatch[1] + '>');
          stats.ip = pitching.ip;
          stats.hitsAllowed = pitching.h;
          stats.runsAllowed = pitching.r;
          stats.er = pitching.er;
          stats.bbp = pitching.bb;
          stats.kp = pitching.so;
          stats.hra = pitching.hr;
          stats.bf = pitching.bf;
          stats.pc = pitching.pitches;
          stats.isPitcher = true;
          // W/L/S indicators
          stats.win = pitching.win === 'true' || pitching.win === '1';
          stats.loss = pitching.loss === 'true' || pitching.loss === '1';
          stats.save = pitching.save === 'true' || pitching.save === '1';
        }

        playerStats.push(stats);
      }
    } catch (error) {
      console.error('[SyncStats] Error parsing XML:', error.message);
    }

    return playerStats;
  }

  /**
   * Parse XML attributes from a self-closing tag
   * @param {string} tagString - XML tag string like <batter player="123" ab="4" />
   * @returns {Object} Object with attribute key-value pairs
   */
  parseXmlAttributes(tagString) {
    const attrs = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = attrRegex.exec(tagString)) !== null) {
      const [, key, value] = match;
      const numValue = parseFloat(value);
      attrs[key] = isNaN(numValue) ? value : numValue;
    }
    return attrs;
  }

  /**
   * Sync game statistics from PrestoSports
   */
  async syncStats(teamId, _userId) {
    const { prestoTeamId, prestoSeasonId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/v2/events/{eventId}/stats`;
    const syncLog = await SyncLog.logStart(teamId, 'stats', _userId, endpoint, {
      presto_team_id: prestoTeamId,
      presto_season_id: prestoSeasonId
    });

    try {
      const token = await this.getToken(teamId);
      const team = await Team.findByPk(teamId);

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
          const eventStats = statsResponse.data || statsResponse || {};

          // Process player stats for this game
          let playerStats = [];

          // PrestoSports returns stats as XML in the 'xml' field
          if (eventStats.xml) {
            playerStats = this.parseBoxScoreXml(eventStats.xml);
            console.log(`[SyncStats] Game ${game.id}: Parsed ${playerStats.length} player stats from XML`);
          } else if (eventStats.players || eventStats.playerStats) {
            // Fallback to JSON format if available
            playerStats = eventStats.players || eventStats.playerStats || [];
          } else if (eventStats.teams) {
            // Check nested teams structure
            const homeStats = eventStats.teams.homeTeam?.players || eventStats.teams.homeTeam?.stats || [];
            const awayStats = eventStats.teams.awayTeam?.players || eventStats.teams.awayTeam?.stats || [];
            playerStats = [...homeStats, ...awayStats];
          }

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
              const [_gameStat, created] = await GameStatistic.upsert(statData, {
                returning: true
              });

              if (created) {
                results.statsCreated++;
              } else {
                results.statsUpdated++;
              }
            } catch (error) {
              results.errors.push({
                item_id: `${game.external_id}-${stat.playerId}`,
                item_type: 'game_stat',
                error: error.message
              });
            }
          }

          results.gamesProcessed++;
        } catch (error) {
          results.errors.push({
            item_id: game.external_id,
            item_type: 'game',
            error: error.message
          });
        }
      }

      // Update team's last sync time
      await team.update({ presto_last_sync_at: new Date() });

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: results.statsCreated,
        updated: results.statsUpdated,
        failed: results.errors.length,
        summary: { games_processed: results.gamesProcessed, stats_synced: results.statsCreated + results.statsUpdated },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Sync team record (W-L) from PrestoSports
   */
  async syncTeamRecord(teamId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/v2/teams/${prestoTeamId}/record`;
    const syncLog = await SyncLog.logStart(teamId, 'team_record', null, endpoint, {
      presto_team_id: prestoTeamId
    });

    try {
      const token = await this.getToken(teamId);
      const team = await Team.findByPk(teamId);
      const response = await prestoSportsService.getTeamRecord(token, prestoTeamId);
      const record = response.data || response;

      // Update team with record data
      await team.update({
        wins: record.wins ?? record.w ?? 0,
        losses: record.losses ?? record.l ?? 0,
        ties: record.ties ?? record.t ?? 0,
        conference_wins: record.conferenceWins ?? record.confW ?? 0,
        conference_losses: record.conferenceLosses ?? record.confL ?? 0,
        record_last_synced_at: new Date(),
        source_system: 'presto'
      });

      const result = {
        success: true,
        record: {
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          conference_wins: team.conference_wins,
          conference_losses: team.conference_losses
        }
      };

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: 0,
        updated: 1,
        failed: 0,
        summary: result.record
      });

      return result;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sync player season stats from PrestoSports
   */
  async syncSeasonStats(teamId, _userId) {
    const { prestoTeamId, prestoSeasonId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/v2/teams/${prestoTeamId}/players/stats`;
    const syncLog = await SyncLog.logStart(teamId, 'season_stats', _userId, endpoint, {
      presto_team_id: prestoTeamId,
      presto_season_id: prestoSeasonId
    });

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    try {
      const token = await this.getToken(teamId);
      const response = await prestoSportsService.getTeamPlayerStats(token, prestoTeamId);
      const playerStats = response.data || [];

      // Fetch season name from Presto API
      let seasonName = null;
      if (prestoSeasonId) {
        try {
          const seasonResp = await prestoSportsService.getSeasonTeams(token, prestoSeasonId);
          const teamEntry = (seasonResp.data || []).find(t => t.teamId === prestoTeamId);
          seasonName = teamEntry?.season?.seasonName || null;
        } catch (_e) { /* non-critical */ }
      }

      for (const playerItem of playerStats) {
        try {
          // Find the player by external_id
          const player = await Player.findOne({
            where: {
              external_id: String(playerItem.playerId || playerItem.id),
              team_id: teamId
            }
          });

          if (!player) {
            continue;
          }

          // Stats are nested inside playerItem.stats as string values
          const s = playerItem.stats || {};
          const n = (v) => this.safeNumber(v);
          const d = (v) => {
            if (v === null || v === undefined || v === '' || v === '-') {
              return null;
            }
            const num = parseFloat(v);
            return isNaN(num) ? null : num;
          };

          const seasonData = {
            player_id: player.id,
            team_id: teamId,
            season: prestoSeasonId || 'current',
            season_name: seasonName,
            presto_season_id: prestoSeasonId,

            // Store full Presto stats payload
            raw_stats: s,

            // Batting stats
            games_played: n(s.gp),
            games_started: n(s.gs),
            at_bats: n(s.ab),
            runs: n(s.r),
            hits: n(s.h),
            doubles: n(s.dsk) || n(s['2b']),
            triples: n(s['3b']),
            home_runs: n(s.hr),
            rbi: n(s.rbi),
            walks: n(s.bb),
            strikeouts: n(s.k),
            stolen_bases: n(s.sb),
            caught_stealing: n(s.cs),
            hit_by_pitch: n(s.hbp),
            sacrifice_flies: n(s.sf),
            sacrifice_bunts: n(s.sh),

            // Calculated batting (from API)
            batting_average: d(s.avg),
            on_base_percentage: d(s.obp),
            slugging_percentage: d(s.slg),
            ops: d(s.ops),

            // Pitching stats
            pitching_appearances: n(s.pgp),
            pitching_starts: n(s.pgs),
            innings_pitched: d(s.ip) ?? 0,
            pitching_wins: n(s.pw),
            pitching_losses: n(s.pl),
            saves: n(s.sv),
            holds: n(s.hd),
            hits_allowed: n(s.ph),
            runs_allowed: n(s.pr),
            earned_runs: n(s.er),
            walks_allowed: n(s.pbb),
            strikeouts_pitching: n(s.pk),
            home_runs_allowed: n(s.phr),

            // Calculated pitching
            era: d(s.era),
            whip: d(s.whip),
            k_per_9: d(s.kavg),
            bb_per_9: d(s.bbavg),

            // Fielding
            fielding_games: n(s.gp),
            putouts: n(s.po),
            assists: n(s.a),
            errors: n(s.e),
            fielding_percentage: d(s.fpct),

            // Source tracking
            external_id: `${prestoTeamId}-${playerItem.playerId || playerItem.id}-${prestoSeasonId}`,
            source_system: 'presto',
            last_synced_at: new Date()
          };

          // Upsert by player_id + season
          const [seasonStat, created] = await PlayerSeasonStats.upsert(seasonData, {
            returning: true
          });

          // Calculate stats if not provided
          if (!seasonData.batting_average && seasonStat.at_bats > 0) {
            seasonStat.calculateBattingStats();
            seasonStat.calculatePitchingStats();
            seasonStat.calculateFieldingStats();
            await seasonStat.save();
          }

          if (created) {
            results.created++;
          } else {
            results.updated++;
          }
        } catch (error) {
          results.errors.push({
            item_id: playerItem.playerId || playerItem.id,
            item_type: 'season_stat',
            error: error.message
          });
        }
      }

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: results.created,
        updated: results.updated,
        failed: results.errors.length,
        summary: { players_processed: playerStats.length },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      results.errors.push({ error: error.message });
      return results;
    }
  }

  /**
   * Sync player career stats from PrestoSports
   */
  async syncCareerStats(teamId, _userId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/v2/players/{playerId}/career-stats`;
    const syncLog = await SyncLog.logStart(teamId, 'career_stats', _userId, endpoint, {
      presto_team_id: prestoTeamId
    });

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    try {
      const token = await this.getToken(teamId);

      // Get all players from this team that came from PrestoSports
      const players = await Player.findAll({
        where: {
          team_id: teamId,
          source_system: 'presto'
        }
      });

      for (const player of players) {
        try {
          const response = await prestoSportsService.getPlayerCareerStats(token, player.external_id);
          const rawData = response.data || response;

          // Presto returns { seasons: [ { player: { stats: {...} }, ... } ] }
          const seasonEntries = rawData.seasons || (Array.isArray(rawData) ? rawData : []);
          if (!seasonEntries.length) {
            continue;
          }

          // Aggregate stats across all seasons from the nested player.stats objects
          const stats = this.aggregateCareerStats(seasonEntries);
          if (!stats || Object.keys(stats).length === 0) {
            continue;
          }

          const n = (v) => this.safeNumber(v);
          const d = (v) => {
            if (v === null || v === undefined || v === '' || v === '-') {
              return null;
            }
            const num = parseFloat(v);
            return isNaN(num) ? null : num;
          };

          const careerData = {
            player_id: player.id,

            seasons_played: stats.seasonsPlayed || seasonEntries.length,
            career_games: n(stats.gp),
            career_at_bats: n(stats.ab),
            career_runs: n(stats.r),
            career_hits: n(stats.h),
            career_doubles: n(stats['2b']),
            career_triples: n(stats['3b']),
            career_home_runs: n(stats.hr),
            career_rbi: n(stats.rbi),
            career_walks: n(stats.bb),
            career_strikeouts: n(stats.k),
            career_stolen_bases: n(stats.sb),

            career_batting_average: d(stats.avg),
            career_obp: d(stats.obp),
            career_slg: d(stats.slg),
            career_ops: d(stats.ops),

            // Career pitching
            career_pitching_appearances: n(stats.pgp),
            career_innings_pitched: d(stats.ip) || 0,
            career_wins: n(stats.pw),
            career_losses: n(stats.pl),
            career_saves: n(stats.sv),
            career_earned_runs: n(stats.er),
            career_strikeouts_pitching: n(stats.pk),

            career_era: d(stats.era),
            career_whip: d(stats.whip),

            // Source tracking
            external_id: `career-${player.external_id}`,
            source_system: 'presto',
            last_synced_at: new Date()
          };

          // Upsert by player_id (unique)
          const [careerStat, created] = await PlayerCareerStats.upsert(careerData, {
            returning: true
          });

          // Calculate stats if not provided
          if (!careerData.career_batting_average && careerStat.career_at_bats > 0) {
            careerStat.calculateBattingStats();
            careerStat.calculatePitchingStats();
            await careerStat.save();
          }

          if (created) {
            results.created++;
          } else {
            results.updated++;
          }
        } catch (error) {
          results.errors.push({
            item_id: player.external_id,
            item_type: 'career_stat',
            player_name: `${player.first_name} ${player.last_name}`,
            error: error.message
          });
        }
      }

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: results.created,
        updated: results.updated,
        failed: results.errors.length,
        summary: { players_processed: players.length },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Sync detailed player profiles from PrestoSports
   * Enriches existing players with bio, hometown, high school, etc.
   */
  async syncPlayerDetails(teamId, _userId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/player/{playerId}`;
    const syncLog = await SyncLog.logStart(teamId, 'player_details', _userId, endpoint, {
      presto_team_id: prestoTeamId
    });

    const results = {
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      const token = await this.getToken(teamId);

      // Get all players from this team that came from PrestoSports
      const players = await Player.findAll({
        where: {
          team_id: teamId,
          source_system: 'presto'
        }
      });

      for (const player of players) {
        try {
          const response = await prestoSportsService.getPlayer(token, player.external_id);
          const details = response.data || response;

          if (!details || Object.keys(details).length === 0) {
            results.skipped++;
            continue;
          }

          // Map PrestoSports player details to our model
          const updateData = {
            bio: details.bio || details.biography || null,
            hometown: this.buildHometown(details),
            high_school: details.highSchool || details.high_school || null,
            high_school_city: details.highSchoolCity || details.hsCity || null,
            high_school_state: details.highSchoolState || details.hsState || null,
            previous_school: details.previousSchool || details.transferFrom || null,
            country: details.country || details.homeCountry || null,
            bats: details.bats || details.batSide || null,
            throws: details.throws || details.throwSide || null,
            major: details.major || details.academicMajor || null,
            eligibility_year: details.eligibilityYear || details.eligibility || null,
            roster_notes: details.rosterNotes || details.notes || null,
            social_links: this.buildSocialLinks(details),
            last_synced_at: new Date()
          };

          // Only update if we have meaningful data
          const hasData = Object.values(updateData).some(v => v !== null && v !== undefined);
          if (hasData) {
            await player.update(updateData);
            results.updated++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          results.errors.push({
            item_id: player.external_id,
            item_type: 'player_details',
            player_name: `${player.first_name} ${player.last_name}`,
            error: error.message
          });
        }
      }

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: 0,
        updated: results.updated,
        failed: results.errors.length,
        summary: { players_processed: players.length, skipped: results.skipped },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Build hometown string from player details
   */
  buildHometown(details) {
    const parts = [];
    if (details.hometown || details.city) {
      parts.push(details.hometown || details.city);
    }
    if (details.homeState || details.state) {
      parts.push(details.homeState || details.state);
    }
    if (details.homeCountry && details.homeCountry !== 'USA' && details.homeCountry !== 'United States') {
      parts.push(details.homeCountry);
    }
    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Build social links object from player details
   */
  buildSocialLinks(details) {
    const links = {};
    if (details.twitter || details.twitterHandle) {
      links.twitter = details.twitter || details.twitterHandle;
    }
    if (details.instagram || details.instagramHandle) {
      links.instagram = details.instagram || details.instagramHandle;
    }
    if (details.facebook) {
      links.facebook = details.facebook;
    }
    if (details.tiktok) {
      links.tiktok = details.tiktok;
    }
    return Object.keys(links).length > 0 ? links : null;
  }

  /**
   * Sync player photos from PrestoSports
   * Updates photo_url field for each player
   */
  async syncPlayerPhotos(teamId, _userId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/player/{playerId}/photos`;
    const syncLog = await SyncLog.logStart(teamId, 'player_photos', _userId, endpoint, {
      presto_team_id: prestoTeamId
    });

    const results = {
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      const token = await this.getToken(teamId);

      // Get all players from this team that came from PrestoSports
      const players = await Player.findAll({
        where: {
          team_id: teamId,
          source_system: 'presto'
        }
      });

      for (const player of players) {
        try {
          const response = await prestoSportsService.getPlayerPhotos(token, player.external_id);
          const photos = response.data || response || [];

          if (!photos || photos.length === 0) {
            results.skipped++;
            continue;
          }

          // Find the best photo (prefer headshot, profile, or first available)
          const photoUrl = this.selectBestPhoto(photos);

          if (photoUrl) {
            await player.update({
              photo_url: photoUrl,
              last_synced_at: new Date()
            });
            results.updated++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          // 404 is common for players without photos - don't treat as error
          if (error.response?.status === 404) {
            results.skipped++;
          } else {
            results.errors.push({
              item_id: player.external_id,
              item_type: 'player_photo',
              player_name: `${player.first_name} ${player.last_name}`,
              error: error.message
            });
          }
        }
      }

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: 0,
        updated: results.updated,
        failed: results.errors.length,
        summary: { players_processed: players.length, skipped: results.skipped },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Select the best photo from a list of photos
   * Prefers headshots and profile photos
   */
  selectBestPhoto(photos) {
    if (!Array.isArray(photos) || photos.length === 0) {
      return null;
    }

    // Priority order: headshot > profile > roster > action > any
    const priorities = ['headshot', 'profile', 'roster', 'action', 'portrait'];

    for (const type of priorities) {
      const match = photos.find(p =>
        (p.type || p.photoType || '').toLowerCase().includes(type) ||
        (p.category || '').toLowerCase().includes(type) ||
        (p.name || p.title || '').toLowerCase().includes(type)
      );
      if (match) {
        return match.url || match.imageUrl || match.src;
      }
    }

    // Fall back to first photo with a URL
    const first = photos.find(p => p.url || p.imageUrl || p.src);
    return first ? (first.url || first.imageUrl || first.src) : null;
  }

  /**
   * Sync historical season-by-season stats for players
   * This pulls stats from previous seasons (useful for transfers)
   */
  async syncHistoricalSeasonStats(teamId, _userId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/stats/player/{playerId}/career/season`;
    const syncLog = await SyncLog.logStart(teamId, 'historical_stats', _userId, endpoint, {
      presto_team_id: prestoTeamId
    });

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    try {
      const token = await this.getToken(teamId);

      // Get all players from this team that came from PrestoSports
      const players = await Player.findAll({
        where: {
          team_id: teamId,
          source_system: 'presto'
        }
      });

      for (const player of players) {
        try {
          const response = await prestoSportsService.getPlayerCareerBySeason(token, player.external_id);
          const rawData = response.data || response;
          // Presto returns { seasons: [ { seasonId, seasonName, players: [...] } ] }
          const seasons = rawData.seasons || (Array.isArray(rawData) ? rawData : []);

          if (!seasons.length) {
            continue;
          }

          for (const seasonEntry of seasons) {
            const seasonYear = seasonEntry.seasonId || seasonEntry.season || seasonEntry.year;
            if (!seasonYear) {
              continue;
            }

            // Find this player's stats in the season — may be in players[] array or player object
            const playerData = seasonEntry?.players?.find(
              p => p.playerId === player.external_id || p.firstName === player.first_name
            ) || seasonEntry?.player;
            const s = playerData?.stats || seasonEntry?.stats || {};
            const n = (v) => this.safeNumber(v);
            const d = (v) => {
              if (v === null || v === undefined || v === '' || v === '-') {
                return null;
              }
              const num = parseFloat(v);
              return isNaN(num) ? null : num;
            };

            const seasonData = {
              player_id: player.id,
              team_id: teamId,
              season: String(seasonYear),
              season_name: seasonEntry.seasonName || null,
              presto_season_id: seasonEntry.seasonId || seasonYear,

              // Batting stats
              games_played: n(s.gp),
              games_started: n(s.gs),
              at_bats: n(s.ab),
              runs: n(s.r),
              hits: n(s.h),
              doubles: n(s.dsk) || n(s['2b']),
              triples: n(s['3b']),
              home_runs: n(s.hr),
              rbi: n(s.rbi),
              walks: n(s.bb),
              strikeouts: n(s.k),
              stolen_bases: n(s.sb),

              // Calculated batting
              batting_average: d(s.avg),
              on_base_percentage: d(s.obp),
              slugging_percentage: d(s.slg),
              ops: d(s.ops),

              // Pitching stats
              pitching_appearances: n(s.pgp),
              innings_pitched: d(s.ip) ?? 0,
              pitching_wins: n(s.pw),
              pitching_losses: n(s.pl),
              saves: n(s.sv),
              earned_runs: n(s.er),
              strikeouts_pitching: n(s.pk),

              // Calculated pitching
              era: d(s.era),
              whip: d(s.whip),

              // Source tracking
              external_id: `${player.external_id}-${seasonYear}-historical`,
              source_system: 'presto',
              last_synced_at: new Date()
            };

            // Upsert by player_id + season
            const [_stat, created] = await PlayerSeasonStats.upsert(seasonData, {
              returning: true
            });

            if (created) {
              results.created++;
            } else {
              results.updated++;
            }
          }
        } catch (error) {
          // 404 is common for players without career history
          if (error.response?.status !== 404) {
            results.errors.push({
              item_id: player.external_id,
              item_type: 'historical_stats',
              player_name: `${player.first_name} ${player.last_name}`,
              error: error.message
            });
          }
        }
      }

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: results.created,
        updated: results.updated,
        failed: results.errors.length,
        summary: { players_processed: players.length },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Sync player videos/highlights from PrestoSports
   */
  async syncPlayerVideos(teamId, _userId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/player/{playerId}/videos`;
    const syncLog = await SyncLog.logStart(teamId, 'player_videos', _userId, endpoint, {
      presto_team_id: prestoTeamId
    });

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    try {
      const token = await this.getToken(teamId);

      // Get all players from this team that came from PrestoSports
      const players = await Player.findAll({
        where: {
          team_id: teamId,
          source_system: 'presto'
        }
      });

      for (const player of players) {
        try {
          const response = await prestoSportsService.getPlayerVideos(token, player.external_id);
          const videos = response.data || response || [];

          if (!Array.isArray(videos) || videos.length === 0) {
            continue;
          }

          for (const video of videos) {
            const videoId = String(video.id || video.videoId);
            const videoData = {
              player_id: player.id,
              team_id: teamId,
              title: video.title || video.name || null,
              description: video.description || video.summary || null,
              url: video.url || video.videoUrl || video.link,
              thumbnail_url: video.thumbnailUrl || video.thumbnail || video.posterUrl || null,
              embed_url: video.embedUrl || video.embedCode || null,
              duration: video.duration || video.length || null,
              video_type: this.mapVideoType(video.type || video.category),
              provider: this.detectVideoProvider(video.url || video.videoUrl),
              provider_video_id: video.providerId || video.externalId || null,
              published_at: video.publishedAt || video.date || video.createdAt || null,
              view_count: video.views || video.viewCount || null,
              external_id: videoId,
              source_system: 'presto',
              last_synced_at: new Date()
            };

            // Skip if no valid URL
            if (!videoData.url) {
              continue;
            }

            // Upsert the video
            const [_playerVideo, created] = await PlayerVideo.upsert(videoData, {
              returning: true
            });

            if (created) {
              results.created++;
            } else {
              results.updated++;
            }
          }
        } catch (error) {
          // 404 is common for players without videos
          if (error.response?.status !== 404) {
            results.errors.push({
              item_id: player.external_id,
              item_type: 'player_video',
              player_name: `${player.first_name} ${player.last_name}`,
              error: error.message
            });
          }
        }
      }

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: results.created,
        updated: results.updated,
        failed: results.errors.length,
        summary: { players_processed: players.length },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Map video type to standard categories
   */
  mapVideoType(type) {
    if (!type) {
      return 'other';
    }
    const typeStr = type.toLowerCase();
    if (typeStr.includes('highlight')) {
      return 'highlight';
    }
    if (typeStr.includes('game') || typeStr.includes('recap')) {
      return 'game';
    }
    if (typeStr.includes('interview')) {
      return 'interview';
    }
    if (typeStr.includes('training') || typeStr.includes('practice')) {
      return 'training';
    }
    if (typeStr.includes('promo')) {
      return 'promotional';
    }
    return 'other';
  }

  /**
   * Detect video provider from URL
   */
  detectVideoProvider(url) {
    if (!url) {
      return null;
    }
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'youtube';
    }
    if (url.includes('vimeo.com')) {
      return 'vimeo';
    }
    if (url.includes('hudl.com')) {
      return 'hudl';
    }
    if (url.includes('twitter.com') || url.includes('x.com')) {
      return 'twitter';
    }
    if (url.includes('instagram.com')) {
      return 'instagram';
    }
    return 'other';
  }

  /**
   * Sync team press releases/news from PrestoSports
   */
  async syncPressReleases(teamId, _userId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const endpoint = `/api/teams/${prestoTeamId}/releases`;
    const syncLog = await SyncLog.logStart(teamId, 'press_releases', _userId, endpoint, {
      presto_team_id: prestoTeamId
    });

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    try {
      const token = await this.getToken(teamId);
      const response = await prestoSportsService.getTeamReleases(token, prestoTeamId);
      const releases = response.data || response || [];

      for (const release of releases) {
        try {
          const releaseId = String(release.id || release.releaseId);
          const releaseData = {
            team_id: teamId,
            title: release.title || release.headline || 'Untitled',
            content: release.content || release.body || null,
            summary: release.summary || release.excerpt || release.description || null,
            author: release.author || release.byline || null,
            publish_date: release.publishDate || release.date || release.createdAt || null,
            category: release.category || release.type || null,
            image_url: release.imageUrl || release.image || release.featuredImage || null,
            source_url: release.url || release.link || null,
            external_id: releaseId,
            source_system: 'presto',
            last_synced_at: new Date()
          };

          // Upsert the release
          const [_newsRelease, created] = await NewsRelease.upsert(releaseData, {
            returning: true
          });

          if (created) {
            results.created++;
          } else {
            results.updated++;
          }
        } catch (error) {
          results.errors.push({
            item_id: release.id || release.releaseId,
            item_type: 'press_release',
            title: release.title,
            error: error.message
          });
        }
      }

      // Log completion
      await SyncLog.logComplete(syncLog.id, {
        created: results.created,
        updated: results.updated,
        failed: results.errors.length,
        summary: { releases_processed: releases.length },
        itemErrors: results.errors.length > 0 ? results.errors : null
      });

      return results;
    } catch (error) {
      await SyncLog.logFailure(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Extract situational split stats from a Presto stats object.
   * These fields are embedded in every response, not requiring separate API calls.
   * @param {object} s - The Presto stats object
   * @returns {object} Keyed by split type
   */
  extractSituationalSplits(s) {
    return {
      vs_lhp: {
        ab: s.hittingvsleftab, h: s.hittingvslefth, pct: s.hittingvsleftpct,
        pitching_ab: s.pitchingvsleftab, pitching_h: s.pitchingvslefth, pitching_pct: s.pitchingvsleftpct
      },
      vs_rhp: {
        ab: s.hittingvsrightab, h: s.hittingvsrighth, pct: s.hittingvsrightpct,
        pitching_ab: s.pitchingvsrightab, pitching_h: s.pitchingvsrighth, pitching_pct: s.pitchingvsrightpct
      },
      risp: {
        record: s.hittingrbi3rd, opportunities: s.hittingrbi3rdno,
        ops: s.hittingrbi3rdops, pct: s.hittingrbi3rdpct
      },
      two_outs: {
        ab: s.hittingw2outsab, h: s.hittingw2outsh, pct: s.hittingw2outspct,
        rbi: s.hittingrbi2out,
        pitching_ab: s.pitchingw2outsab, pitching_h: s.pitchingw2outsh, pitching_pct: s.pitchingw2outspct
      },
      bases_loaded: {
        ab: s.hittingwloadedab, h: s.hittingwloadedh, pct: s.hittingwloadedpct,
        pitching_ab: s.pitchingwloadedab, pitching_h: s.pitchingwloadedh, pitching_pct: s.pitchingwloadedpct
      },
      bases_empty: {
        ab: s.hittingemptyab, h: s.hittingemptyh, pct: s.hittingemptypct,
        pitching_ab: s.pitchingemptyab, pitching_h: s.pitchingemptyh, pitching_pct: s.pitchingemptypct
      },
      with_runners: {
        ab: s.hittingwrunnersab, h: s.hittingwrunnersh, pct: s.hittingwrunnerspct,
        pitching_ab: s.pitchingwrunnersab, pitching_h: s.pitchingwrunnersh, pitching_pct: s.pitchingwrunnerspct
      },
      leadoff: {
        record: s.hittingleadoff, opportunities: s.hittingleadoffno,
        ops: s.hittingleadoffops, pct: s.hittingleadoffpct,
        pitching_record: s.pitchingleadoff, pitching_opportunities: s.pitchingleadoffno,
        pitching_ops: s.pitchingleadoffops, pitching_pct: s.pitchingleadoffpct
      }
    };
  }

  /**
   * Sync split stats (HOME/AWAY/CONFERENCE) and situational stats for all players.
   * Called as part of syncAll() on the 4-hour cycle.
   */
  async syncSplitStats(teamId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const results = { updated: 0, errors: [] };
    const token = await this.getToken(teamId);

    // Fetch overall stats first (for situational splits embedded in response)
    const overallResponse = await prestoSportsService.getTeamPlayerStats(token, prestoTeamId);
    const overallPlayers = overallResponse.data || [];

    // Build a map: prestoPlayerId -> situational splits from overall response
    const situationalByPrestoId = {};
    for (const p of overallPlayers) {
      const s = p.stats || {};
      situationalByPrestoId[p.playerId] = this.extractSituationalSplits(s);
    }

    // Fetch HOME, AWAY, CONFERENCE splits (requires separate API calls)
    const splitOptions = ['HOME', 'AWAY', 'CONFERENCE'];
    const splitDataByPrestoId = {};

    for (const opt of splitOptions) {
      try {
        const response = await prestoSportsService.getTeamPlayerStats(token, prestoTeamId, { options: opt });
        const players = response.data || [];
        for (const p of players) {
          if (!splitDataByPrestoId[p.playerId]) {
            splitDataByPrestoId[p.playerId] = {};
          }
          splitDataByPrestoId[p.playerId][opt.toLowerCase()] = p.stats || {};
        }
      } catch (error) {
        results.errors.push({ split: opt, error: error.message });
      }
    }

    // Now merge and save to DB
    for (const prestoPlayerId of Object.keys(splitDataByPrestoId)) {
      try {
        const player = await Player.findOne({
          where: { external_id: String(prestoPlayerId), team_id: teamId }
        });
        if (!player) continue;

        const splitStats = {
          ...splitDataByPrestoId[prestoPlayerId],
          ...(situationalByPrestoId[prestoPlayerId] || {})
        };

        await PlayerSeasonStats.update(
          { split_stats: splitStats },
          {
            where: {
              player_id: player.id,
              team_id: teamId,
              source_system: 'presto'
            }
          }
        );
        results.updated++;
      } catch (error) {
        results.errors.push({ player: prestoPlayerId, error: error.message });
      }
    }

    return results;
  }

  /**
   * Sync everything (roster, schedule, stats, record, season stats, career stats)
   */
  async syncAll(teamId, userId) {
    const { prestoTeamId, prestoSeasonId } = await this.getPrestoConfig(teamId);
    const syncLog = await SyncLog.logStart(teamId, 'full', userId, '/api/v2/sync/all', {
      presto_team_id: prestoTeamId,
      presto_season_id: prestoSeasonId
    });

    const results = {
      roster: null,
      schedule: null,
      stats: null,
      teamRecord: null,
      seasonStats: null,
      splitStats: null,
      careerStats: null,
      playerDetails: null,
      playerPhotos: null,
      historicalStats: null,
      playerVideos: null,
      pressReleases: null,
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

    try {
      results.teamRecord = await this.syncTeamRecord(teamId);
    } catch (error) {
      results.errors.push({ type: 'teamRecord', error: error.message });
    }

    try {
      results.seasonStats = await this.syncSeasonStats(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'seasonStats', error: error.message });
    }

    try {
      results.splitStats = await this.syncSplitStats(teamId);
    } catch (error) {
      results.errors.push({ type: 'splitStats', error: error.message });
    }

    try {
      results.careerStats = await this.syncCareerStats(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'careerStats', error: error.message });
    }

    try {
      results.playerDetails = await this.syncPlayerDetails(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'playerDetails', error: error.message });
    }

    try {
      results.playerPhotos = await this.syncPlayerPhotos(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'playerPhotos', error: error.message });
    }

    try {
      results.historicalStats = await this.syncHistoricalSeasonStats(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'historicalStats', error: error.message });
    }

    try {
      results.playerVideos = await this.syncPlayerVideos(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'playerVideos', error: error.message });
    }

    try {
      results.pressReleases = await this.syncPressReleases(teamId, userId);
    } catch (error) {
      results.errors.push({ type: 'pressReleases', error: error.message });
    }

    // Calculate totals for the full sync log
    const totalCreated = (results.roster?.created || 0) + (results.schedule?.created || 0) +
      (results.stats?.statsCreated || 0) + (results.seasonStats?.created || 0) +
      (results.careerStats?.created || 0) + (results.playerDetails?.updated || 0) +
      (results.playerPhotos?.updated || 0) + (results.historicalStats?.created || 0) +
      (results.playerVideos?.created || 0) + (results.pressReleases?.created || 0);
    const totalUpdated = (results.roster?.updated || 0) + (results.schedule?.updated || 0) +
      (results.stats?.statsUpdated || 0) + (results.seasonStats?.updated || 0) +
      (results.splitStats?.updated || 0) +
      (results.careerStats?.updated || 0) + (results.teamRecord?.success ? 1 : 0) +
      (results.historicalStats?.updated || 0) + (results.playerVideos?.updated || 0) +
      (results.pressReleases?.updated || 0);
    const totalFailed = results.errors.length +
      (results.roster?.errors?.length || 0) + (results.schedule?.errors?.length || 0) +
      (results.stats?.errors?.length || 0) + (results.seasonStats?.errors?.length || 0) +
      (results.splitStats?.errors?.length || 0) +
      (results.careerStats?.errors?.length || 0) + (results.playerDetails?.errors?.length || 0) +
      (results.playerPhotos?.errors?.length || 0) + (results.historicalStats?.errors?.length || 0) +
      (results.playerVideos?.errors?.length || 0) + (results.pressReleases?.errors?.length || 0);

    await SyncLog.logComplete(syncLog.id, {
      created: totalCreated,
      updated: totalUpdated,
      failed: totalFailed,
      summary: {
        roster: results.roster ? { created: results.roster.created, updated: results.roster.updated } : null,
        schedule: results.schedule ? { created: results.schedule.created, updated: results.schedule.updated } : null,
        stats: results.stats ? { created: results.stats.statsCreated, updated: results.stats.statsUpdated } : null,
        teamRecord: results.teamRecord?.record || null,
        seasonStats: results.seasonStats ? { created: results.seasonStats.created, updated: results.seasonStats.updated } : null,
        splitStats: results.splitStats ? { updated: results.splitStats.updated } : null,
        careerStats: results.careerStats ? { created: results.careerStats.created, updated: results.careerStats.updated } : null,
        playerDetails: results.playerDetails ? { updated: results.playerDetails.updated } : null,
        playerPhotos: results.playerPhotos ? { updated: results.playerPhotos.updated } : null,
        historicalStats: results.historicalStats ? { created: results.historicalStats.created, updated: results.historicalStats.updated } : null,
        playerVideos: results.playerVideos ? { created: results.playerVideos.created, updated: results.playerVideos.updated } : null,
        pressReleases: results.pressReleases ? { created: results.pressReleases.created, updated: results.pressReleases.updated } : null
      },
      itemErrors: results.errors.length > 0 ? results.errors : null
    });

    return results;
  }

  /**
   * Sync live stats for an active game
   * Designed for real-time polling during games
   * @param {number} teamId - Team ID
   * @param {number} gameId - Our internal game ID (must have presto_event_id or external_id set)
   * @param {number} userId - User initiating the sync (optional)
   * @returns {Object} Current game state and updated stats
   */
  async syncLiveStats(teamId, gameId, _userId = null) {
    const results = {
      success: false,
      game: null,
      gameState: null,
      statsUpdated: 0,
      statsCreated: 0,
      errors: []
    };

    try {
      const token = await this.getToken(teamId);

      // Find the game and get its PrestoSports event ID
      const game = await Game.findOne({
        where: {
          id: gameId,
          team_id: teamId
        }
      });

      if (!game) {
        throw new Error('Game not found');
      }

      const eventId = game.presto_event_id || game.external_id;
      if (!eventId) {
        throw new Error('Game has no PrestoSports event ID - cannot fetch live stats');
      }

      results.game = {
        id: game.id,
        opponent: game.opponent,
        game_date: game.game_date,
        home_away: game.home_away
      };

      // Get the home team ID required by the livestats API ('h' param)
      const eventDetails = await prestoSportsService.getEvent(token, eventId);
      const eventData = eventDetails.data || eventDetails;
      const homeTeamId = eventData.teams?.homeTeam?.teamId;
      if (!homeTeamId) {
        throw new Error('Could not determine home team ID from event details');
      }

      // Fetch live stats from PrestoSports
      let liveData;
      try {
        liveData = await prestoSportsService.getEventLiveStats(token, eventId, homeTeamId);
      } catch (liveErr) {
        if (liveErr.response?.status === 404) {
          // 404 = no stats yet (game hasn't started) — not an error
          results.success = true;
          results.gameState = { status: 'not_started' };
          return results;
        }
        throw liveErr;
      }

      // Extract game state
      results.gameState = {
        status: liveData.status || liveData.gameStatus || 'unknown',
        inning: liveData.inning || liveData.currentInning || null,
        inningHalf: liveData.inningHalf || liveData.half || null,
        homeScore: liveData.homeScore ?? liveData.homeTeam?.score ?? null,
        awayScore: liveData.awayScore ?? liveData.awayTeam?.score ?? null,
        outs: liveData.outs ?? null,
        balls: liveData.balls ?? null,
        strikes: liveData.strikes ?? null,
        runnersOn: liveData.runnersOn || liveData.runners || null,
        lastUpdate: liveData.timestamp || liveData.lastUpdated || new Date().toISOString()
      };

      // Update game score if we have it
      if (results.gameState.homeScore !== null || results.gameState.awayScore !== null) {
        const isHome = game.home_away === 'home';
        const teamScore = isHome ? results.gameState.homeScore : results.gameState.awayScore;
        const oppScore = isHome ? results.gameState.awayScore : results.gameState.homeScore;

        await game.update({
          team_score: teamScore,
          opponent_score: oppScore,
          game_status: this.mapLiveGameStatus(results.gameState.status),
          last_synced_at: new Date()
        });
      }

      // Get player stats from live data
      const playerStats = liveData.playerStats || liveData.stats || liveData.boxScore?.players || [];

      // Build lookup for local players by external ID
      const localPlayers = await Player.findAll({
        where: { team_id: teamId },
        attributes: ['id', 'external_id', 'presto_player_id', 'first_name', 'last_name']
      });

      const playerLookup = new Map();
      for (const player of localPlayers) {
        if (player.external_id) {
          playerLookup.set(player.external_id, player);
        }
        if (player.presto_player_id) {
          playerLookup.set(player.presto_player_id, player);
        }
      }

      // Process each player's stats
      for (const statLine of playerStats) {
        try {
          const playerId = statLine.playerId || statLine.player_id || statLine.id;
          const localPlayer = playerLookup.get(String(playerId));

          if (!localPlayer) {
            // Try to match by name as fallback
            const name = statLine.name || `${statLine.firstName || ''} ${statLine.lastName || ''}`.trim();
            if (!name) {
              continue;
            }
            // Skip players we can't match
            continue;
          }

          // Build stat data from live feed
          const statData = {
            game_id: game.id,
            player_id: localPlayer.id,
            team_id: teamId,
            source_system: 'presto',
            last_synced_at: new Date(),
            // Batting stats
            at_bats: this.parseStatValue(statLine.ab || statLine.atBats),
            runs: this.parseStatValue(statLine.r || statLine.runs),
            hits: this.parseStatValue(statLine.h || statLine.hits),
            doubles: this.parseStatValue(statLine['2b'] || statLine.doubles),
            triples: this.parseStatValue(statLine['3b'] || statLine.triples),
            home_runs: this.parseStatValue(statLine.hr || statLine.homeRuns),
            rbi: this.parseStatValue(statLine.rbi),
            walks: this.parseStatValue(statLine.bb || statLine.walks),
            strikeouts_batting: this.parseStatValue(statLine.so || statLine.strikeouts),
            stolen_bases: this.parseStatValue(statLine.sb || statLine.stolenBases),
            // Pitching stats (if pitcher)
            innings_pitched: this.parseInningsPitched(statLine.ip || statLine.inningsPitched),
            hits_allowed: this.parseStatValue(statLine.ha || statLine.hitsAllowed),
            runs_allowed: this.parseStatValue(statLine.ra || statLine.runsAllowed),
            earned_runs: this.parseStatValue(statLine.er || statLine.earnedRuns),
            walks_allowed: this.parseStatValue(statLine.bba || statLine.walksAllowed),
            strikeouts_pitching: this.parseStatValue(statLine.k || statLine.strikeoutsPitching),
            pitches_thrown: this.parseStatValue(statLine.pc || statLine.pitchCount || statLine.pitchesThrown)
          };

          // Upsert the stat record
          const [_statRecord, created] = await GameStatistic.upsert(statData, {
            returning: true,
            conflictFields: ['game_id', 'player_id']
          });

          if (created) {
            results.statsCreated++;
          } else {
            results.statsUpdated++;
          }
        } catch (error) {
          results.errors.push({
            playerId: statLine.playerId || statLine.player_id,
            error: error.message
          });
        }
      }

      results.success = true;
    } catch (error) {
      results.error = error.message;
      console.error(`Error syncing live stats for game ${gameId}:`, error);
    }

    return results;
  }

  /**
   * Get list of games that can have live stats synced (today's games or games in progress)
   * @param {number} teamId - Team ID
   * @returns {Array} List of games eligible for live stats
   */
  async getLiveEligibleGames(teamId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find today's games only — must have a PrestoSports event ID
    const games = await Game.findAll({
      where: {
        team_id: teamId,
        game_date: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        },
        game_status: { [Op.ne]: 'completed' },
        [Op.or]: [
          { presto_event_id: { [Op.ne]: null } },
          { external_id: { [Op.ne]: null } }
        ]
      },
      order: [['game_date', 'ASC']],
      attributes: ['id', 'opponent', 'game_date', 'game_time', 'home_away', 'team_score', 'opponent_score', 'game_status', 'presto_event_id', 'external_id']
    });

    return games;
  }

  /**
   * Map PrestoSports live game status to our enum
   */
  mapLiveGameStatus(prestoStatus) {
    const statusStr = String(prestoStatus).toLowerCase();
    if (statusStr.includes('final') || statusStr.includes('complete')) {
      return 'completed';
    }
    if (statusStr.includes('cancel')) {
      return 'cancelled';
    }
    if (statusStr.includes('postpone') || statusStr.includes('delay')) {
      return 'postponed';
    }
    return 'scheduled'; // includes in-progress
  }

  /**
   * Parse a stat value, handling various formats
   */
  parseStatValue(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Parse innings pitched (handles "6.2" format where .2 = 2 outs)
   */
  parseInningsPitched(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
}

module.exports = new PrestoSyncService();

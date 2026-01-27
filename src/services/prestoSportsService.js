const axios = require('axios');

const PRESTO_API_BASE_URL = 'https://gameday-api.prestosports.com/api';

class PrestoSportsService {
  constructor() {
    this.baseUrl = PRESTO_API_BASE_URL;
    this.tokenCache = new Map(); // Cache tokens per team
  }

  /**
   * Get cached token for a team or null if expired/missing
   */
  getCachedToken(teamId) {
    const cached = this.tokenCache.get(teamId);
    if (!cached) {
      return null;
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Date.now();
    if (now >= cached.expiresAt - 300000) {
      this.tokenCache.delete(teamId);
      return null;
    }

    return cached;
  }

  /**
   * Cache a token for a team
   */
  cacheToken(teamId, tokenData) {
    this.tokenCache.set(teamId, {
      idToken: tokenData.idToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: Date.now() + (tokenData.expirationTimeInSeconds * 1000)
    });
  }

  /**
   * Clear cached token for a team (used when disconnecting)
   */
  clearCachedToken(teamId) {
    this.tokenCache.delete(teamId);
  }

  /**
   * Authenticate with PrestoSports API
   * @param {string} username - PrestoSports username
   * @param {string} password - PrestoSports password
   * @returns {Promise<{idToken: string, refreshToken: string, expirationTimeInSeconds: number}>}
   */
  async authenticate(username, password) {
    try {
      const response = await axios.post(`${this.baseUrl}/auth/token`, {
        username,
        password
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('PrestoSports authentication error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error_description || 'Authentication failed');
    }
  }

  /**
   * Refresh an expired token
   * @param {string} refreshToken - The refresh token
   * @returns {Promise<{idToken: string, refreshToken: string, expirationTimeInSeconds: number}>}
   */
  async refreshToken(refreshToken) {
    try {
      const response = await axios.post(`${this.baseUrl}/auth/token/refresh`, {
        refreshToken
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('PrestoSports token refresh error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error_description || 'Token refresh failed');
    }
  }

  /**
   * Make an authenticated API request
   * @param {string} token - JWT token
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {object} params - Query parameters
   * @param {object} data - Request body
   */
  async makeRequest(token, method, endpoint, params = {}, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`PrestoSports API error (${endpoint}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get user info for authenticated user
   */
  async getUserInfo(token) {
    return this.makeRequest(token, 'GET', '/me/info');
  }

  /**
   * Get seasons accessible to the user
   */
  async getSeasons(token) {
    return this.makeRequest(token, 'GET', '/me/seasons');
  }

  /**
   * Get season details
   */
  async getSeason(token, seasonId) {
    return this.makeRequest(token, 'GET', `/seasons/${seasonId}`);
  }

  /**
   * Get teams for a season
   */
  async getSeasonTeams(token, seasonId, criteria = {}) {
    return this.makeRequest(token, 'GET', `/seasons/${seasonId}/teams`, criteria);
  }

  /**
   * Get teams accessible to the user
   */
  async getUserTeams(token, criteria = {}) {
    return this.makeRequest(token, 'GET', '/me/teams', criteria);
  }

  /**
   * Get team information
   */
  async getTeam(token, teamId) {
    return this.makeRequest(token, 'GET', `/teams/${teamId}`);
  }

  /**
   * Get team roster (players)
   */
  async getTeamPlayers(token, teamId) {
    return this.makeRequest(token, 'GET', `/teams/${teamId}/players`);
  }

  /**
   * Get team events (games/schedule)
   */
  async getTeamEvents(token, teamId) {
    return this.makeRequest(token, 'GET', `/teams/${teamId}/events`);
  }

  /**
   * Get team scores/record
   */
  async getTeamScores(token, teamId) {
    return this.makeRequest(token, 'GET', `/teams/${teamId}/scores`);
  }

  /**
   * Get event details
   */
  async getEvent(token, eventId) {
    return this.makeRequest(token, 'GET', `/events/${eventId}`);
  }

  /**
   * Get event statistics
   */
  async getEventStats(token, eventId) {
    return this.makeRequest(token, 'GET', `/events/${eventId}/stats`);
  }

  /**
   * Get event players (box score roster)
   */
  async getEventPlayers(token, eventId, teamId) {
    return this.makeRequest(token, 'GET', `/events/${eventId}/teams/${teamId}/players`);
  }

  /**
   * Get player profile
   */
  async getPlayer(token, playerId) {
    return this.makeRequest(token, 'GET', `/player/${playerId}`);
  }

  /**
   * Get player photos
   */
  async getPlayerPhotos(token, playerId) {
    return this.makeRequest(token, 'GET', `/player/${playerId}/photos`);
  }

  /**
   * Get player videos
   */
  async getPlayerVideos(token, playerId) {
    return this.makeRequest(token, 'GET', `/player/${playerId}/videos`);
  }

  /**
   * Get player news/releases
   */
  async getPlayerReleases(token, playerId) {
    return this.makeRequest(token, 'GET', `/player/${playerId}/releases`);
  }

  /**
   * Get team press releases
   */
  async getTeamReleases(token, teamId) {
    return this.makeRequest(token, 'GET', `/teams/${teamId}/releases`);
  }

  /**
   * Get player career stats by season
   */
  async getPlayerCareerBySeason(token, playerId, criteria = {}) {
    return this.makeRequest(token, 'GET', `/stats/player/${playerId}/career/season`, criteria);
  }

  /**
   * Get live stats for an event
   */
  async getEventLiveStats(token, eventId) {
    return this.makeRequest(token, 'GET', `/events/${eventId}/livestats`);
  }

  /**
   * Get player stats
   */
  async getPlayerStats(token, playerId, criteria = {}) {
    return this.makeRequest(token, 'GET', `/stats/player/${playerId}`, criteria);
  }

  /**
   * Get player career stats
   */
  async getPlayerCareerStats(token, playerId, criteria = {}) {
    return this.makeRequest(token, 'GET', `/stats/player/${playerId}/career`, criteria);
  }

  /**
   * Get team stats
   */
  async getTeamStats(token, teamId, criteria = {}) {
    return this.makeRequest(token, 'GET', `/stats/teams/${teamId}/stats`, criteria);
  }

  /**
   * Get team record
   */
  async getTeamRecord(token, teamId, criteria = {}) {
    return this.makeRequest(token, 'GET', `/stats/teams/${teamId}/record`, criteria);
  }

  /**
   * Get team player stats
   */
  async getTeamPlayerStats(token, teamId, criteria = {}) {
    return this.makeRequest(token, 'GET', `/stats/teams/${teamId}/players`, criteria);
  }

  /**
   * Get team event stats
   */
  async getTeamEventStats(token, teamId, criteria = {}) {
    return this.makeRequest(token, 'GET', `/stats/teams/${teamId}/events`, criteria);
  }

  /**
   * Get available sports
   */
  async getSports(token) {
    return this.makeRequest(token, 'GET', '/sports');
  }

  /**
   * Get organizations
   */
  async getOrganizations(token) {
    return this.makeRequest(token, 'GET', '/organizations');
  }

  /**
   * Test connection with credentials
   * @param {string} username - PrestoSports username
   * @param {string} password - PrestoSports password
   * @returns {Promise<{success: boolean, userInfo?: object, error?: string}>}
   */
  async testConnection(username, password) {
    try {
      const authResult = await this.authenticate(username, password);
      const userInfo = await this.getUserInfo(authResult.idToken);

      return {
        success: true,
        userInfo: userInfo.data,
        token: authResult
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Connection failed'
      };
    }
  }
}

module.exports = new PrestoSportsService();

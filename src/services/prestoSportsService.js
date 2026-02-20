const httpcloak = require('httpcloak');

const PRESTO_API_BASE_URL = 'https://gameday-api.prestosports.com/api';

class PrestoSportsService {
  constructor() {
    this.baseUrl = PRESTO_API_BASE_URL;
    this.tokenCache = new Map(); // Cache tokens per team
    this._lastRequestAt = 0; // Throttle: track last request time
    this._requestLog = []; // Rolling log of recent requests (last 100)
    this._stats = { total: 0, success: 0, retries: 0, failures: 0 };
    this._session = null; // Reusable httpcloak session (Chrome TLS fingerprint)
  }

  /**
   * Get or create a persistent httpcloak session.
   * The session mimics Chrome-144's TLS fingerprint to bypass Cloudflare.
   */
  _getSession() {
    if (!this._session) {
      this._session = new httpcloak.Session({ preset: 'chrome-144' });
    }
    return this._session;
  }

  /**
   * Get recent request log and aggregate stats.
   * Useful for diagnosing Presto API issues from /presto/diagnostics endpoint.
   */
  getDiagnostics() {
    return {
      stats: { ...this._stats },
      recentRequests: this._requestLog.slice(-50),
    };
  }

  /**
   * Track a Presto API request for diagnostics
   */
  _trackRequest(entry) {
    this._requestLog.push(entry);
    if (this._requestLog.length > 100) {
      this._requestLog.shift();
    }
  }

  /**
   * Parse httpcloak response body (Buffer) into a JS value.
   * httpcloak returns raw Buffers; we convert to string then try JSON.parse.
   */
  _parseBody(body) {
    if (!body) return null;
    const str = Buffer.isBuffer(body) ? body.toString('utf8')
      : typeof body === 'object' && body.type === 'Buffer' ? Buffer.from(body.data).toString('utf8')
      : typeof body === 'string' ? body
      : Buffer.from(body).toString('utf8');
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }

  /**
   * Low-level HTTP request using httpcloak (Chrome TLS fingerprint).
   * All Presto API calls (auth + data) funnel through this method.
   * httpcloak mimics Chrome's TLS handshake, so Cloudflare never triggers.
   * @param {object} axiosConfig - Axios-style request config (url, method, headers, data, params)
   * @param {string} label - Human-readable label for logging
   * @param {object} [opts] - Options
   * @param {number} [opts.maxRetries=1] - Max retry attempts on 403/429
   * @param {boolean} [opts.throttle=true] - Whether to apply 1s inter-request throttle
   */
  async _doRequest(axiosConfig, label, { maxRetries = 1, throttle = true } = {}) {
    const baseDelay = 1000;

    if (throttle) {
      const now = Date.now();
      const timeSinceLast = now - (this._lastRequestAt || 0);
      if (timeSinceLast < 1000) {
        await new Promise(r => setTimeout(r, 1000 - timeSinceLast));
      }
    }

    const entry = {
      timestamp: new Date().toISOString(),
      method: (axiosConfig.method || 'POST').toUpperCase(),
      endpoint: label,
      attempts: 0,
      status: null,
      durationMs: null,
      throttled: throttle,
      error: null
    };

    const startTime = Date.now();
    this._stats.total++;

    // Build URL with query params
    let url = axiosConfig.url;
    if (axiosConfig.params && Object.keys(axiosConfig.params).length > 0) {
      const qs = new URLSearchParams(axiosConfig.params).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }

    const method = (axiosConfig.method || 'POST').toUpperCase();
    const session = this._getSession();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      entry.attempts = attempt + 1;

      try {
        this._lastRequestAt = Date.now();

        // Build httpcloak request options
        const opts = {
          headers: { ...axiosConfig.headers }
        };

        // For POST/PUT/PATCH with JSON body, use the json option
        let response;
        if (['POST', 'PUT', 'PATCH'].includes(method) && axiosConfig.data) {
          opts.json = axiosConfig.data;
          delete opts.headers['Content-Type']; // httpcloak sets this for json option
        }

        if (method === 'GET') {
          response = await session.get(url, opts);
        } else if (method === 'POST') {
          response = await session.post(url, opts);
        } else if (method === 'PUT') {
          response = await session.put(url, opts);
        } else if (method === 'PATCH') {
          response = await session.patch(url, opts);
        } else if (method === 'DELETE') {
          response = await session.delete(url, opts);
        } else {
          response = await session.get(url, opts);
        }

        const status = response.statusCode;
        const data = this._parseBody(response.body);

        // Treat 4xx/5xx as errors (match axios behavior)
        if (status >= 400) {
          const err = new Error(
            (data && data.error_description) || (data && data.message) || `HTTP ${status}`
          );
          err.response = { status, data };
          throw err;
        }

        entry.status = status;
        entry.durationMs = Date.now() - startTime;
        this._stats.success++;
        this._trackRequest(entry);

        if (attempt > 0) {
          console.log(`[Presto] OK ${label} after ${attempt} retries (${entry.durationMs}ms)`);
        }

        return { status, data, headers: response.headers || {} };
      } catch (error) {
        const status = error.response?.status;

        if ((status === 403 || status === 429) && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          this._stats.retries++;
          console.warn(`[Presto] ${status} on ${label}, retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        entry.status = status || 'NETWORK_ERROR';
        entry.durationMs = Date.now() - startTime;
        entry.error = error.response?.data?.error_description || error.message;
        this._stats.failures++;
        this._trackRequest(entry);

        if (status !== 404) {
          console.error(`[Presto] FAIL ${label} → ${status || 'NETWORK_ERROR'} after ${entry.attempts} attempts (${entry.durationMs}ms)`);
        }
        throw error;
      }
    }
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
      const response = await this._doRequest({
        method: 'POST',
        url: `${this.baseUrl}/auth/token`,
        headers: { 'Content-Type': 'application/json' },
        data: { username, password }
      }, 'POST /auth/token');

      return response.data;
    } catch (error) {
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
      const response = await this._doRequest({
        method: 'POST',
        url: `${this.baseUrl}/auth/token/refresh`,
        headers: { 'Content-Type': 'application/json' },
        data: { refreshToken }
      }, 'POST /auth/token/refresh');

      return response.data;
    } catch (error) {
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

    const response = await this._doRequest(config, `${method} ${endpoint}`);
    return response.data;
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
   * @param {string} token - JWT token
   * @param {string} eventId - PrestoSports event ID
   * @param {string} homeTeamId - PrestoSports home team ID (required by API as 'h' param)
   */
  async getEventLiveStats(token, eventId, homeTeamId) {
    return this.makeRequest(token, 'GET', `/events/${eventId}/livestats`, { h: homeTeamId });
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

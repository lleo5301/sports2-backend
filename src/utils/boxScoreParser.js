'use strict';

const { XMLParser } = require('fast-xml-parser');

/**
 * Parse PrestoSports box score XML into structured JSON.
 *
 * The Presto `getEventStats` endpoint returns XML with this structure:
 *   <bsgame> (or root element)
 *     <team vh="V" ...>        ← visitor
 *       <linescore .../>
 *       <starters>...</starters>
 *       <player ...><hitting .../><fielding .../><pitching .../></player>
 *       <totals><hitting .../><fielding .../><pitching .../></totals>
 *     </team>
 *     <team vh="H" ...>        ← home
 *       ... same structure ...
 *     </team>
 *   </bsgame>
 *
 * Opponent players have name="" but still carry uni (jersey), pos, and full stats.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  // Ensure single-element arrays stay as arrays
  isArray: (name) => ['team', 'player', 'inning'].includes(name),
  parseAttributeValue: false,  // keep all values as strings for consistency
});

/**
 * Parse full box score XML into structured JSON
 * @param {string} xml - Raw XML string from getEventStats
 * @returns {Object} Structured box score with visitor/home teams
 */
function parseBoxScore(xml) {
  if (!xml || typeof xml !== 'string') {
    return null;
  }

  const parsed = parser.parse(xml);

  // Navigate to root game element (could be bsgame, boxscore, or the root itself)
  const game = parsed.bsgame || parsed.boxscore || parsed;

  // Extract team elements
  const teams = game.team || [];
  if (!Array.isArray(teams) || teams.length === 0) {
    return null;
  }

  const visitor = teams.find(t => t.vh === 'V') || teams[0];
  const home = teams.find(t => t.vh === 'H') || teams[1];

  return {
    visitor: visitor ? parseTeam(visitor, 'visitor') : null,
    home: home ? parseTeam(home, 'home') : null,
    gameInfo: extractGameInfo(game),
  };
}

/**
 * Parse a single <team> element
 */
function parseTeam(team, role) {
  const players = ensureArray(team.player).map(parsePlayer);

  // Separate pitchers from position players
  const batters = players.filter(p => !p.isPitcher || p.hitting);
  const pitchers = players.filter(p => p.isPitcher);

  return {
    role,
    id: team.id || null,
    name: team.name || null,
    code: team.code || null,
    record: team.record || null,
    linescore: parseLinescore(team.linescore),
    totals: parseTotals(team.totals),
    batters,
    pitchers,
    starters: parseStarters(team.starters),
  };
}

/**
 * Parse a <player> element with its nested stat elements
 */
function parsePlayer(p) {
  const result = {
    playerId: p.playerId || null,
    name: p.name || null,
    shortname: p.shortname || null,
    uni: p.uni || null,       // jersey number
    pos: p.pos || null,       // position
    atpos: p.atpos || null,   // position played in this game
    spot: p.spot || null,     // batting order spot
    gp: p.gp || null,
  };

  // Hitting stats
  if (p.hitting) {
    result.hitting = extractAttributes(p.hitting);
  }

  // Fielding stats
  if (p.fielding) {
    result.fielding = extractAttributes(p.fielding);
  }

  // Pitching stats
  if (p.pitching) {
    result.pitching = extractAttributes(p.pitching);
    result.isPitcher = true;
  }

  return result;
}

/**
 * Parse <linescore> element (inning-by-inning scores)
 */
function parseLinescore(ls) {
  if (!ls) return null;

  const innings = ensureArray(ls.inning || ls.lineinn).map(inn => ({
    number: inn.number || inn.inn,
    score: inn.score || inn.runs,
  }));

  return {
    innings,
    runs: ls.r || ls.runs || null,
    hits: ls.h || ls.hits || null,
    errors: ls.e || ls.errors || null,
    lob: ls.lob || null,
  };
}

/**
 * Parse <totals> element (team aggregate stats)
 */
function parseTotals(totals) {
  if (!totals) return null;

  return {
    hitting: totals.hitting ? extractAttributes(totals.hitting) : null,
    fielding: totals.fielding ? extractAttributes(totals.fielding) : null,
    pitching: totals.pitching ? extractAttributes(totals.pitching) : null,
  };
}

/**
 * Parse <starters> element
 */
function parseStarters(starters) {
  if (!starters) return null;
  return ensureArray(starters.player || starters.starter).map(s => ({
    playerId: s.playerId || null,
    name: s.name || null,
    uni: s.uni || null,
    pos: s.pos || null,
    spot: s.spot || null,
  }));
}

/**
 * Extract game-level info from the root element
 */
function extractGameInfo(game) {
  return {
    date: game.date || null,
    location: game.location || game.stadium || null,
    attendance: game.attend || game.attendance || null,
    duration: game.duration || null,
    weather: game.weather || null,
    status: game.status || null,
  };
}

/**
 * Extract all attributes from an element.
 * fast-xml-parser puts attributes directly on the object.
 * Filter out child elements (objects/arrays) — keep only scalar values.
 */
function extractAttributes(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const attrs = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val !== 'object' || val === null) {
      attrs[key] = val;
    }
  }
  return attrs;
}

/**
 * Ensure value is an array
 */
function ensureArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

module.exports = { parseBoxScore };

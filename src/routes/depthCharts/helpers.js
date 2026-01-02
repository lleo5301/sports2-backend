/**
 * @fileoverview Helper functions for depth chart operations.
 * Provides scoring algorithms for player recommendations based on position fit and performance.
 *
 * @module routes/depthCharts/helpers
 */

/**
 * @description Calculates a position match score based on how well a player's position
 *              fits the target position on the depth chart.
 *
 *              Position groups are defined for related positions that share skillsets:
 *              - Pitchers: P, SP, RP, CP
 *              - Infielders: 1B, 2B, 3B, SS (with IF, MI, CI variants)
 *              - Outfielders: LF, CF, RF (with OF variant)
 *              - Utility: DH, UTIL
 *
 * @param {string} playerPosition - Player's primary position code
 * @param {string} targetPositionCode - Target position code on depth chart
 * @returns {Object} result - Scoring result
 * @returns {number} result.score - Position match score (20-100)
 * @returns {Array<string>} result.reasons - Explanation of the match quality
 */
function getPositionMatchScore(playerPosition, targetPositionCode) {
  let score = 0;
  const reasons = [];

  // Best case: Exact position match
  if (playerPosition === targetPositionCode) {
    score += 100;
    reasons.push('Exact position match');
    return { score, reasons };
  }

  // Business logic: Define position groups for related positions
  // Players in the same group have transferable skills
  const positionGroups = {
    'P': ['P', 'SP', 'RP', 'CP'],      // All pitching roles
    'C': ['C'],                         // Catcher is specialized
    '1B': ['1B', 'IF'],                 // Corner infield
    '2B': ['2B', 'IF', 'MI'],           // Middle infield
    '3B': ['3B', 'IF', 'CI'],           // Corner infield
    'SS': ['SS', 'IF', 'MI'],           // Middle infield
    'LF': ['LF', 'OF'],                 // Outfield
    'CF': ['CF', 'OF'],                 // Outfield (requires more range)
    'RF': ['RF', 'OF'],                 // Outfield (often strongest arm)
    'DH': ['DH', 'UTIL']                // Designated hitter
  };

  const targetGroup = positionGroups[targetPositionCode] || [];

  // Good case: Same position group
  if (targetGroup.includes(playerPosition)) {
    score += 80;
    reasons.push('Position group match');
  } else if (playerPosition === 'UTIL' || playerPosition === 'IF' || playerPosition === 'OF') {
    // Acceptable case: Utility/general position
    score += 60;
    reasons.push('Utility player');
  } else {
    // Fallback: Position mismatch but player can still fill spot
    score += 20;
    reasons.push('Position mismatch');
  }

  return { score, reasons };
}

/**
 * @description Calculates a performance score based on player statistics relevant
 *              to the target position. Uses different metrics for pitchers vs position players.
 *
 *              Pitcher scoring (target positions: P, SP, RP, CP):
 *              - ERA < 3.00: +50 points (excellent)
 *              - ERA < 4.00: +30 points (good)
 *              - Strikeouts > 50: +20 points
 *              - Win rate > 60%: +25 points
 *
 *              Position player scoring (all other positions):
 *              - Batting avg > .300: +40 points (excellent)
 *              - Batting avg > .250: +20 points (good)
 *              - Home runs > 5: +15 points
 *              - RBI > 20: +15 points
 *              - Stolen bases > 10: +15 points
 *
 * @param {Object} player - Player object with statistics
 * @param {string} positionCode - Target position code on depth chart
 * @returns {Object} result - Scoring result
 * @returns {number} result.score - Performance score (0-100+)
 * @returns {Array<string>} result.reasons - Explanation of scoring factors
 */
function getPerformanceScore(player, positionCode) {
  let score = 0;
  const reasons = [];

  // Business logic: Use pitching metrics for pitcher positions
  if (['P', 'SP', 'RP', 'CP'].includes(positionCode)) {
    // ERA is the most important pitching metric
    if (player.era !== null && player.era < 3.00) {
      score += 50;
      reasons.push(`Excellent ERA: ${player.era}`);
    } else if (player.era !== null && player.era < 4.00) {
      score += 30;
      reasons.push(`Good ERA: ${player.era}`);
    }

    // Strikeout ability shows dominance
    if (player.strikeouts !== null && player.strikeouts > 50) {
      score += 20;
      reasons.push(`High strikeouts: ${player.strikeouts}`);
    }

    // Win-loss record indicates game performance
    if (player.wins !== null && player.losses !== null) {
      const winRate = player.wins / (player.wins + player.losses);
      if (winRate > 0.6) {
        score += 25;
        reasons.push(`Good win rate: ${(winRate * 100).toFixed(0)}%`);
      }
    }
  }
  // Business logic: Use batting metrics for position players
  else {
    // Batting average is primary hitting metric
    if (player.batting_avg !== null && player.batting_avg > 0.300) {
      score += 40;
      reasons.push(`High average: ${player.batting_avg}`);
    } else if (player.batting_avg !== null && player.batting_avg > 0.250) {
      score += 20;
      reasons.push(`Good average: ${player.batting_avg}`);
    }

    // Power hitting
    if (player.home_runs !== null && player.home_runs > 5) {
      score += 15;
      reasons.push(`Power hitter: ${player.home_runs} HR`);
    }

    // Run production
    if (player.rbi !== null && player.rbi > 20) {
      score += 15;
      reasons.push(`RBI producer: ${player.rbi} RBI`);
    }

    // Speed on the basepaths
    if (player.stolen_bases !== null && player.stolen_bases > 10) {
      score += 15;
      reasons.push(`Speed: ${player.stolen_bases} SB`);
    }
  }

  return { score, reasons };
}

module.exports = {
  getPositionMatchScore,
  getPerformanceScore
};

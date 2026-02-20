'use strict';

/**
 * Parses play-by-play XML from PrestoSports event stats.
 * Extracts the <plays> section and returns structured inning-by-inning data.
 *
 * @param {string} xml - Full event stats XML from Presto
 * @returns {Object|null} Parsed play-by-play data or null if no plays found
 */
function parsePlayByPlay(xml) {
  if (!xml || typeof xml !== 'string') return null;

  const playsStart = xml.indexOf('<plays');
  const playsEnd = xml.indexOf('</plays>');
  if (playsStart === -1 || playsEnd === -1) return null;

  const playsXml = xml.substring(playsStart, playsEnd + '</plays>'.length);

  // Extract format attribute
  const formatMatch = playsXml.match(/<plays\s+format="([^"]*)"/);
  const format = formatMatch ? formatMatch[1] : 'summary';

  const innings = [];
  const inningRegex = /<inning\s+number="(\d+)">([\s\S]*?)<\/inning>/g;
  let inningMatch;

  while ((inningMatch = inningRegex.exec(playsXml)) !== null) {
    const inningNumber = parseInt(inningMatch[1]);
    const inningXml = inningMatch[2];
    const halves = [];

    // Parse each batting half (visitor/home)
    const battingRegex = /<batting\s+id="([^"]*)"(?:\s+vh="([^"]*)")?>([\s\S]*?)<\/batting>/g;
    let battingMatch;

    while ((battingMatch = battingRegex.exec(inningXml)) !== null) {
      const teamName = battingMatch[1];
      const vh = battingMatch[2] || null; // V=visitor, H=home
      const battingXml = battingMatch[3];
      const plays = [];

      // Parse individual plays
      const playRegex = /<play>([\s\S]*?)<\/play>/g;
      let playMatch;

      while ((playMatch = playRegex.exec(battingXml)) !== null) {
        const playXml = playMatch[1];
        const play = parsePlay(playXml);
        plays.push(play);
      }

      // Parse inning summary if present in this batting section
      const summaryMatch = battingXml.match(/<innsummary\s+([^>]*)\/?\s*>/);
      const summary = summaryMatch ? parseAttributes(summaryMatch[1]) : null;

      halves.push({
        team: teamName,
        side: vh === 'V' ? 'away' : vh === 'H' ? 'home' : null,
        plays,
        summary: summary ? {
          runs: parseInt(summary.r) || 0,
          hits: parseInt(summary.h) || 0,
          errors: parseInt(summary.e) || 0,
          left_on_base: parseInt(summary.lob) || 0
        } : null
      });
    }

    // Also check for innsummary at the inning level (outside batting tags)
    const inningSummaryRegex = /<innsummary\s+([^>]*)\/?\s*>/g;
    let inningSummaryMatch;
    while ((inningSummaryMatch = inningSummaryRegex.exec(inningXml)) !== null) {
      // Only capture if not already captured inside a batting block
      const summaryPos = inningSummaryMatch.index;
      const isInsideBatting = halves.some(h => {
        const bStart = inningXml.indexOf(`<batting id="${h.team}"`);
        const bEnd = inningXml.indexOf('</batting>', bStart);
        return summaryPos > bStart && summaryPos < bEnd;
      });

      if (!isInsideBatting) {
        const attrs = parseAttributes(inningSummaryMatch[1]);
        // Attach to the most recent half without a summary
        const lastHalf = halves[halves.length - 1];
        if (lastHalf && !lastHalf.summary) {
          lastHalf.summary = {
            runs: parseInt(attrs.r) || 0,
            hits: parseInt(attrs.h) || 0,
            errors: parseInt(attrs.e) || 0,
            left_on_base: parseInt(attrs.lob) || 0
          };
        }
      }
    }

    innings.push({
      inning: inningNumber,
      halves
    });
  }

  // Extract line score if present
  const lineScore = parseLineScore(xml);

  return {
    format,
    innings,
    line_score: lineScore,
    total_plays: innings.reduce((sum, inn) =>
      sum + inn.halves.reduce((hSum, h) => hSum + h.plays.length, 0), 0
    )
  };
}

/**
 * Parse a single <play> block into structured data.
 */
function parsePlay(playXml) {
  const play = { batter: null, runners: [], narrative: null };

  // Parse batter
  const batterMatch = playXml.match(/<batter\s+([^>]*)\/?\s*>/);
  if (batterMatch) {
    const attrs = parseAttributes(batterMatch[1]);
    play.batter = {
      name: attrs.name || null,
      uni: attrs.uni || null,
      out: parseInt(attrs.out) === 1,
      scored: parseInt(attrs.scored) === 1,
      to_base: parseInt(attrs.tobase) || 0
    };
  }

  // Parse runners
  const runnerRegex = /<runner\s+([^>]*)\/?\s*>/g;
  let runnerMatch;
  while ((runnerMatch = runnerRegex.exec(playXml)) !== null) {
    const attrs = parseAttributes(runnerMatch[1]);
    play.runners.push({
      name: attrs.name || null,
      uni: attrs.uni || null,
      out: parseInt(attrs.out) === 1,
      scored: parseInt(attrs.scored) === 1,
      to_base: parseInt(attrs.tobase) || 0
    });
  }

  // Parse narrative
  const narrativeMatch = playXml.match(/<narrative\s+text="([^"]*)"\/?\s*>/);
  if (narrativeMatch) {
    play.narrative = narrativeMatch[1];
  }

  return play;
}

/**
 * Parse XML attributes from a string like 'name="foo" out="0"'
 */
function parseAttributes(attrString) {
  const attrs = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/**
 * Parse the line score from the XML.
 * Structure: <team vh="V" name="...">...<linescore errs="1" hits="6" runs="0" line="0,0,0,...">
 *   <lineinn inn="1" score="0"/>...
 * </linescore>...</team>
 */
function parseLineScore(xml) {
  // Find all <team> blocks that contain a <linescore>
  const teamRegex = /<team\s+([^>]*)>([\s\S]*?)<\/team>/g;
  const teams = [];
  let teamMatch;

  while ((teamMatch = teamRegex.exec(xml)) !== null) {
    const teamAttrs = parseAttributes(teamMatch[1]);
    const teamXml = teamMatch[2];

    const lsMatch = teamXml.match(/<linescore\s+([^>]*)>([\s\S]*?)<\/linescore>/);
    if (!lsMatch) continue;

    const lsAttrs = parseAttributes(lsMatch[1]);
    const lsXml = lsMatch[2];
    const innings = [];

    const innRegex = /<lineinn\s+([^>]*)\/?\s*>/g;
    let innMatch;
    while ((innMatch = innRegex.exec(lsXml)) !== null) {
      const attrs = parseAttributes(innMatch[1]);
      innings.push({
        inning: parseInt(attrs.inn) || innings.length + 1,
        runs: attrs.score === 'X' ? 'X' : (parseInt(attrs.score) || 0)
      });
    }

    teams.push({
      id: teamAttrs.id || null,
      name: teamAttrs.name || null,
      side: teamAttrs.vh === 'V' ? 'away' : teamAttrs.vh === 'H' ? 'home' : null,
      innings,
      runs: parseInt(lsAttrs.runs) || 0,
      hits: parseInt(lsAttrs.hits) || 0,
      errors: parseInt(lsAttrs.errs) || 0,
      left_on_base: parseInt(lsAttrs.lob) || 0
    });
  }

  return teams.length > 0 ? teams : null;
}

module.exports = { parsePlayByPlay };

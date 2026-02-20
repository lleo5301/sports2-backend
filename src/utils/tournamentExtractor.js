/**
 * Extract tournament information from a Presto Sports event object.
 *
 * The Presto `notes` field is overloaded — it may contain:
 *   - A tournament / invitational name  (e.g. "Snowbird Classic")
 *   - A double-header flag             (e.g. "DH", "Double Header")
 *   - A location override              (e.g. "at Gainesville", "Miami, FL")
 *   - A venue name                     (e.g. "NY Yankees - Community Field")
 *   - Or nothing meaningful
 *
 * @param {object} event - Presto event object
 * @returns {{ tournamentName: string|null, isDoubleHeader: boolean }}
 */
function extractTournamentInfo(event) {
  const result = { tournamentName: null, isDoubleHeader: false };

  // Scrimmages are never part of a tournament
  if (event.eventTypeCode?.toLowerCase() === 'scrimmage') {
    return result;
  }

  const notes = (event.notes || '').trim();
  if (!notes) {
    return result;
  }

  // Double-header patterns — not a tournament
  if (/^double[\s-]?header$/i.test(notes) || /^dh$/i.test(notes)) {
    result.isDoubleHeader = true;
    return result;
  }

  // Location override with "at" prefix — not a tournament
  if (/^at\s+/i.test(notes)) {
    return result;
  }

  // Game number patterns — not a tournament (e.g. "Game 1", "Gm 2")
  if (/^g(ame|m)\s*\d/i.test(notes)) {
    return result;
  }

  // City, State patterns — not a tournament
  // Matches: "Miami, FL", "Fort Myers, Fla.", "Gainesville, FL", "Miami, Fla."
  if (/^[A-Z][a-zA-Z\s.]+,\s*[A-Za-z]{2,5}\.?$/i.test(notes)) {
    return result;
  }

  // Venue / field patterns — not a tournament
  // Matches notes containing "Field", "Park", "Stadium", "Complex", "Diamond"
  if (/\b(field|park|stadium|complex|diamond|arena|coliseum|center)\b/i.test(notes)) {
    return result;
  }

  // Everything else is treated as a tournament name
  result.tournamentName = notes;
  return result;
}

module.exports = { extractTournamentInfo };

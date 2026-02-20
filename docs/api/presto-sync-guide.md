# PrestoSports Sync System — Technical Guide

**Audience:** Frontend developers, backend developers new to the codebase
**Scope:** PrestoSports integration, sync operations, team stats endpoints
**Last updated:** 2026-02-20

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication Flow](#2-authentication-flow)
3. [Sync Operations Reference](#3-sync-operations-reference)
4. [Force Sync](#4-force-sync)
5. [Sync Audit Log](#5-sync-audit-log)
6. [Stats API Endpoints](#6-stats-api-endpoints)
7. [Box Score XML Parsing](#7-box-score-xml-parsing)
8. [Incomplete Data Handling](#8-incomplete-data-handling)
9. [Background Scheduler](#9-background-scheduler)
10. [Integration Endpoints Quick Reference](#10-integration-endpoints-quick-reference)

---

## 1. Overview

### What is PrestoSports

PrestoSports is a collegiate sports data provider that supplies roster information, schedules, game statistics, and media assets to athletic departments. Their GameDay API is the authoritative data source for player records, box scores, season stats, and career stats in this platform.

The API base URL is:

```
https://gameday-api.prestosports.com/api
```

All requests require a Bearer token obtained by authenticating with a PrestoSports username and password. Tokens expire (typically in 1 hour) and can be refreshed using a refresh token.

### Two-Layer Architecture

The integration is split across two service files with distinct responsibilities:

**`prestoSportsService.js`** — HTTP client layer
- Owns the `httpcloak` session and all network calls
- Handles throttling (1 second minimum between requests)
- Handles retry logic (exponential backoff on 403/429)
- Exposes typed methods: `getTeamPlayers()`, `getEventStats()`, `getPlayer()`, etc.
- Tracks request diagnostics (recent requests, success/failure counts)
- Is exported as a singleton (`module.exports = new PrestoSportsService()`)

**`prestoSyncService.js`** — Business logic layer
- Calls `prestoSportsService` to get raw data
- Maps Presto field names to local database schema
- Creates/updates Sequelize models (Player, Game, GameStatistic, etc.)
- Manages sync logs via `SyncLog`
- Is instantiated fresh per import but effectively acts as a singleton

```
API Route Handler
      │
      ▼
prestoSyncService          ← business logic, DB writes, sync logs
      │
      ▼
prestoSportsService        ← HTTP client, token cache, throttle, retry
      │
      ▼
httpcloak session          ← Chrome TLS fingerprint, bypasses Cloudflare
      │
      ▼
gameday-api.prestosports.com
```

### httpcloak and Cloudflare Bypass

The PrestoSports GameDay API is protected by Cloudflare. Standard HTTP client libraries (axios, node-fetch) trigger Cloudflare bot detection because their TLS fingerprint does not resemble a real browser.

The `httpcloak` library solves this by mimicking the Chrome 144 TLS handshake at the socket level. A single persistent session is reused across all calls:

```javascript
// src/services/prestoSportsService.js:19-23
_getSession() {
  if (!this._session) {
    this._session = new httpcloak.Session({ preset: 'chrome-144' });
  }
  return this._session;
}
```

This means all Presto API calls — authentication and data requests alike — go through `_doRequest()`, which uses the `httpcloak` session. Never bypass this by making direct HTTP calls.

---

## 2. Authentication Flow

### Credential Storage

PrestoSports credentials are stored in the `IntegrationCredential` model, encrypted at rest. The `integrationCredentialService` handles encryption/decryption and token lifecycle. Each team stores:

- `username` / `password` — PrestoSports login credentials (encrypted)
- `team_id` — Presto's internal team identifier (used in most API calls)
- `season_id` — The configured season to pull data for
- `access_token` — Current JWT (encrypted, with expiry timestamp)
- `refresh_token` — Token for refreshing the access token without re-authenticating

### Token Resolution Order

`prestoSyncService.getToken(teamId)` follows this priority order on every call:

```
1. In-memory cache (prestoSportsService.tokenCache)
   └─ If found and not within 5-minute expiry buffer → return cached token

2. Database credential store (integrationCredentialService)
   └─ If stored access token is valid → cache in memory, return it

3. Token refresh (if stored access token is expired and refresh token exists)
   └─ POST /auth/token/refresh with refresh token
   └─ If successful → save new tokens to DB, cache in memory, return
   └─ If refresh fails → fall through to step 4

4. Fresh authentication (username + password)
   └─ POST /auth/token with credentials
   └─ Save both access token and refresh token to DB (refresh TTL: 30 days)
   └─ Cache access token in memory
   └─ Return access token
```

The in-memory cache uses a 5-minute pre-expiry buffer to avoid using a token that expires in-flight:

```javascript
// src/services/prestoSportsService.js:198-201
if (now >= cached.expiresAt - 300000) {  // 300000ms = 5 minutes
  this.tokenCache.delete(teamId);
  return null;
}
```

### Authentication API Calls

```
POST /api/auth/token
Body: { username, password }
Response: { idToken, refreshToken, expirationTimeInSeconds }

POST /api/auth/token/refresh
Body: { refreshToken }
Response: { idToken, refreshToken, expirationTimeInSeconds }
```

### Configuring a New Integration

A head coach or super_admin calls `POST /api/v1/integrations/presto/configure`. This endpoint:

1. Tests the credentials against the Presto API immediately
2. Saves the encrypted credentials to `IntegrationCredential`
3. Saves the initial access and refresh tokens returned from the test authentication

```bash
curl -X POST http://localhost:5000/api/v1/integrations/presto/configure \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "coach@university.edu",
    "password": "prestopassword",
    "prestoTeamId": "12345",
    "prestoSeasonId": "67890"
  }'
```

---

## 3. Sync Operations Reference

All sync methods follow the same pattern:

1. Get Presto config (team ID, season ID) from credential store
2. Create a `SyncLog` record with status `started`
3. Get or refresh an auth token
4. Call the relevant Presto API endpoint(s)
5. Map and upsert records into the local database
6. Update the `SyncLog` to `completed`, `partial`, or `failed`

Each sync type is independent — if one fails inside `syncAll()`, the others still run.

---

### syncRoster

**Purpose:** Imports or updates all players on the team roster.

**Presto API call:** `GET /teams/{prestoTeamId}/players`

**Local model:** `Player`

**Match key:** `external_id` (= Presto's player ID as a string)

**Field mapping from Presto response:**

| Presto field | Local field | Notes |
|---|---|---|
| `id` or `playerId` | `external_id`, `presto_player_id` | Stored as string |
| `firstName` / `first_name` | `first_name` | |
| `lastName` / `last_name` | `last_name` | |
| `position` | `position` | Mapped through `mapPosition()` |
| `height` | `height` | Parsed from formats like "6-2", "6'2", "6 2" → "6-2" |
| `weight` | `weight` | Parsed as integer |
| `uniform` | `jersey_number` | Falls back to `jerseyNumber`, `jersey_number`, `attributes.number` |
| `year` | `class_year` | Mapped through `mapClassYear()` — handles "FR", "FRESHMAN", "RS-FR", etc. |
| `headshot` | `photo_url` | |
| `attributes.bats_throws` | `bats`, `throws` | Split on "/" — e.g. "R/R" → bats="R", throws="R" |
| `dob` | `birth_date` | |
| `hometown` or `attributes.hometown` | `hometown` | |

**Position mapping (non-obvious cases):**

| Presto | Local | Reason |
|---|---|---|
| `INF` | `SS` | Generic infielder defaults to SS |
| `UT` | `OF` | Utility player defaults to OF |
| `PH` | `DH` | Pinch hitter maps to DH |
| `PR` | `OF` | Pinch runner maps to OF |

**Returns:** `{ created: N, updated: N, errors: [] }`

---

### syncSchedule

**Purpose:** Imports or updates all games/events on the team schedule.

**Presto API call:** `GET /teams/{prestoTeamId}/events`

**Local model:** `Game`

**Match key:** `external_id` (= Presto's event ID as a string)

**Key behavior:**

- Home/away determination: Checks `event.teams.homeTeam.teamId === prestoTeamId`. If our team is the home team, the opponent is `awayTeam`. Otherwise, we are away.
- Score parsing: Presto returns `event.score.home` and `event.score.away` as strings (possibly empty). The service converts them to integers and assigns `team_score`/`opponent_score` based on home/away.
- Game status: If both scores are present, `game_status` is set to `completed` regardless of the status code.
- TBA games: If `event.tba === true`, `game_date` and `game_time` are set to null.
- Season name: A supplementary call to `GET /seasons/{seasonId}/teams` resolves the human-readable season name.

**Event status code mapping:**

| Presto statusCode | Local game_status |
|---|---|
| -2 | `scheduled` (Not Started) |
| -1 | `scheduled` (In Progress — no "in_progress" enum exists) |
| 0 or higher | `completed` (Final) |

**Returns:** `{ created: N, updated: N, errors: [] }`

---

### syncStats

**Purpose:** Fetches the box score for each completed game and stores per-player statistics as `GameStatistic` rows.

**Presto API call:** `GET /events/{eventId}/stats` (once per unsynced game)

**Local model:** `GameStatistic`

**Match key:** `external_id` = `"{game.external_id}-{stat.playerId}"`

**Skip logic:** A game is considered "fully synced" only if it has **at least 2 `GameStatistic` rows** (`MIN_PLAYERS_FOR_SYNCED = 2`). Games with 0 or 1 stat rows are re-attempted on every sync. This threshold prevents a game with incomplete Presto data (e.g., only a score row, no individual stats) from being prematurely marked as done.

Without `force=true`, the service:
1. Fetches all completed games for the team with `source_system = 'presto'`
2. Queries `GameStatistic` counts grouped by `game_id`
3. Excludes game IDs where `stat_count >= 2` from the sync list

With `force=true`, all completed games are synced regardless of existing row counts.

**Data flow:**

```
GET /events/{eventId}/stats
  └─ response.data.xml  (primary path)
      └─ parseBoxScoreXml() → array of player stat objects
          └─ For each player stat:
              └─ Player.findOne({ external_id: stat.playerId, team_id })
              └─ GameStatistic.upsert(statData)
  └─ response.data.players  (fallback if no xml field)
  └─ response.data.teams.homeTeam.players + awayTeam.players  (second fallback)
```

**Stats stored per player per game:**

Batting: `at_bats`, `runs`, `hits`, `doubles`, `triples`, `home_runs`, `rbi`, `walks`, `strikeouts_batting`, `stolen_bases`, `caught_stealing`, `hit_by_pitch`, `sacrifice_flies`, `sacrifice_bunts`

Pitching: `innings_pitched`, `hits_allowed`, `runs_allowed`, `earned_runs`, `walks_allowed`, `strikeouts_pitching`, `home_runs_allowed`, `batters_faced`, `pitches_thrown`, `strikes_thrown`, `win`, `loss`, `save`, `hold`

Fielding: `putouts`, `assists`, `errors`

**Returns:** `{ gamesProcessed: N, statsCreated: N, statsUpdated: N, skipped: N, errors: [] }`

---

### syncTeamRecord

**Purpose:** Updates the team's overall and conference win-loss record.

**Presto API call:** `GET /stats/teams/{prestoTeamId}/record`

**Local model:** `Team` (updates `wins`, `losses`, `ties`, `conference_wins`, `conference_losses`)

**Key behavior:** The Presto record API returns W-L as a string (e.g., `"7-8"`) in the `record` and `conferenceRecord` fields, not as separate numeric fields. The service splits on "-" and parses each part:

```javascript
const parseWL = (str) => {
  const parts = str.split('-').map(Number);
  return { w: parts[0] || 0, l: parts[1] || 0 };
};
const overall = parseWL(record.record);  // "7-8" → { w: 7, l: 8 }
```

The service also checks `record.wins` / `record.losses` as direct numeric fields and uses them as a fallback if present.

**Returns:** `{ success: true, record: { wins, losses, ties, conference_wins, conference_losses } }`

---

### syncSeasonStats

**Purpose:** Fetches current-season batting/pitching/fielding stats for all players and stores them in `PlayerSeasonStats`.

**Presto API call:** `GET /stats/teams/{prestoTeamId}/players`

**Local model:** `PlayerSeasonStats`

**Match key:** `player_id` + `season` (upsert)

**Key Presto field names:** Presto uses abbreviated keys. Doubles are `dsk` (not `2b`). Pitching walks are `pbb`, pitching strikeouts are `pk`. All stat values come as strings and must be parsed.

Calculated stats (avg, obp, slg, era, whip) are provided directly by Presto in the response. If they are missing or blank (`"-"`), the model's `calculateBattingStats()` / `calculatePitchingStats()` methods derive them locally.

**Returns:** `{ created: N, updated: N, errors: [] }`

---

### syncCareerStats

**Purpose:** Fetches career stats (totals across all seasons) for each player and stores them in `PlayerCareerStats`.

**Presto API call:** `GET /stats/player/{playerId}/career` (one call per player)

**Local model:** `PlayerCareerStats`

**TTL skip logic:** Players whose `last_synced_at` is within the past 24 hours are skipped unless `force=true`. This prevents hammering the Presto API with per-player calls on every scheduled sync.

**Aggregation:** The Presto career endpoint returns `{ seasons: [ { player: { stats: {...} } } ] }`. The service's `aggregateCareerStats()` method sums numeric fields across all season entries to compute career totals. It also computes career AVG (`career_hits / career_at_bats`) and ERA (`(career_earned_runs * 9) / career_innings_pitched`).

**Returns:** `{ created: N, updated: N, errors: [] }`

---

### syncPlayerDetails

**Purpose:** Enriches existing Player records with detailed biographical data.

**Presto API call:** `GET /player/{playerId}` (one call per player)

**Local model:** `Player` (update only, never creates)

**TTL skip logic:** Players synced within the past 24 hours are skipped unless `force=true`.

**Field mapping from Presto player detail response:**

| Presto field | Local field | Notes |
|---|---|---|
| `bio` / `biography` | `bio` | |
| `hometown`, `city`, `homeState`, `state`, `homeCountry` | `hometown` | Built as "City, State" or "City, State, Country" |
| `highSchool` | `high_school` | |
| `highSchoolCity` / `hsCity` | `high_school_city` | |
| `highSchoolState` / `hsState` | `high_school_state` | |
| `previousSchool` / `transferFrom` | `previous_school` | |
| `bats` / `batSide` | `bats` | |
| `throws` / `throwSide` | `throws` | |
| `major` / `academicMajor` | `major` | |
| `eligibilityYear` / `eligibility` | `eligibility_year` | |
| `twitter`, `instagram`, `facebook`, `tiktok` | `social_links` | Stored as JSONB |

A player is only updated if at least one field in `updateData` is non-null. Empty responses are counted as `skipped`.

**Returns:** `{ updated: N, skipped: N, errors: [] }`

---

### syncPlayerPhotos

**Purpose:** Updates the `photo_url` field for each player by fetching their photo list from Presto.

**Presto API call:** `GET /player/{playerId}/photos` (one call per player)

**Local model:** `Player` (`photo_url` field only)

**TTL skip logic:** 24-hour TTL applies unless `force=true`.

**Photo selection priority:** headshot > profile > roster > action > portrait > first available URL

**404 handling:** Players without photos return 404 from Presto. These are counted as `skipped`, not errors.

**Returns:** `{ updated: N, skipped: N, errors: [] }`

---

### syncHistoricalSeasonStats

**Purpose:** Fetches season-by-season breakdowns for each player (useful for transfers with stats from prior institutions) and stores each season as a separate `PlayerSeasonStats` row.

**Presto API call:** `GET /stats/player/{playerId}/career/season` (one call per player)

**Local model:** `PlayerSeasonStats` (upserted by `player_id` + `season`)

**TTL skip logic:** 24-hour TTL applies unless `force=true`.

**Data structure:** Presto returns `{ seasons: [ { seasonId, seasonName, players: [...] } ] }`. Each season entry may embed the player's stats either in `players[]` (matched by `playerId` or `firstName`) or in a `player` object directly.

**Returns:** `{ created: N, updated: N, errors: [] }`

---

### syncPlayerVideos

**Purpose:** Syncs player highlight video metadata from PrestoSports into the `PlayerVideo` model.

**Presto API call:** `GET /player/{playerId}/videos` (one call per player)

**Local model:** `PlayerVideo`

**TTL skip logic:** 24-hour TTL applies unless `force=true`.

**Video type mapping:** Presto video type strings are normalized to: `highlight`, `game`, `interview`, `training`, `promotional`, or `other`.

**Provider detection:** URL-based detection resolves to: `youtube`, `vimeo`, `hudl`, `twitter`, `instagram`, or `other`.

**404 handling:** Players without videos return 404 from Presto. These are silently skipped.

**Returns:** `{ created: N, updated: N, errors: [] }`

---

### syncPressReleases

**Purpose:** Syncs news/press release articles published by PrestoSports for the team.

**Presto API call:** `GET /teams/{prestoTeamId}/releases`

**Local model:** `NewsRelease`

**Match key:** `external_id` (= Presto's release ID)

**No TTL or force flag** — press releases are always synced in full.

**Returns:** `{ created: N, updated: N, errors: [] }`

---

### syncSplitStats

**Purpose:** Syncs situational and home/away/conference split stats for all players. Updates the `split_stats` JSONB column on `PlayerSeasonStats` rows.

**Presto API calls:**
- `GET /stats/teams/{prestoTeamId}/players` — overall stats (contains situational splits embedded in the flat stats object)
- `GET /stats/teams/{prestoTeamId}/players?options=HOME` — home game stats
- `GET /stats/teams/{prestoTeamId}/players?options=AWAY` — away game stats
- `GET /stats/teams/{prestoTeamId}/players?options=CONFERENCE` — conference game stats

**Situational splits extracted from overall response:**

| Split key | Description |
|---|---|
| `vs_lhp` | vs. left-handed pitchers (batting and pitching) |
| `vs_rhp` | vs. right-handed pitchers |
| `risp` | Runners in scoring position |
| `two_outs` | With 2 outs |
| `bases_loaded` | With bases loaded |
| `bases_empty` | With bases empty |
| `with_runners` | With runners on base |
| `leadoff` | Leadoff plate appearances |

**No TTL or force flag.** Called as part of `syncAll()`.

**Returns:** `{ updated: N, errors: [] }`

---

### syncTeamAggregateStats

**Purpose:** Syncs team-level batting, pitching, and fielding totals. Stores them as JSONB blobs on the `Team` record.

**Presto API call:** `GET /stats/teams/{prestoTeamId}/stats`

**Local model:** `Team` — updates `team_batting_stats`, `team_pitching_stats`, `team_fielding_stats`, and `stats_last_synced_at`

The Presto response is a flat stats object. The service partitions keys into three groups by name (batting keys include `ab`, `avg`, `hr`, etc.; pitching keys include `era`, `ip`, `pk`, etc.; fielding keys include `e`, `fpct`, etc.).

**No TTL or force flag.** Called as part of `syncAll()`.

**Returns:** `{ success: true }`

---

### syncGameLog

**Purpose:** Updates each local `Game` record with per-game team stats, running record strings, and game summaries from Presto's team event stats endpoint.

**Presto API call:** `GET /stats/teams/{prestoTeamId}/events`

**Local model:** `Game` — updates `team_stats`, `game_summary`, `running_record`, `running_conference_record`

Games are matched to Presto events by `presto_event_id` or `external_id`. Events without a match are skipped.

**No TTL or force flag.** Called as part of `syncAll()`.

**Returns:** `{ updated: N, skipped: N, errors: [] }`

---

### syncOpponentStats

**Purpose:** Parses box score XML for each completed game to extract the opposing team's player stats and stores them in `OpponentGameStat`.

**Presto API call:** `GET /events/{eventId}/stats` (one call per unsynced game — same endpoint as `syncStats`)

**Local model:** `OpponentGameStat`

**Force flag:** Respects `force=true`. Without it, games that already have opponent stat rows are skipped.

The XML box score contains both teams. The service identifies the opponent's team element by finding the `<team>` node whose team ID does not match `prestoTeamId`, then parses that team's player stats.

**Returns:** `{ gamesProcessed: N, playersCreated: N, playersUpdated: N, errors: [] }`

---

### syncLiveStats

**Purpose:** Fetches real-time play-by-play and score data for an in-progress game. Designed for frontend polling during active games.

**Presto API calls:**
1. `GET /events/{eventId}` — resolves the home team ID (required by the live stats API)
2. `GET /events/{eventId}/livestats?h={homeTeamId}` — live stats

**Local model:** `Game` (score updated in real-time), `GameStatistic` (upserted)

**404 behavior:** If the live stats endpoint returns 404, the game hasn't started yet. The service returns `{ success: true, gameState: { status: 'not_started' } }` without error.

**Returns:**
```json
{
  "success": true,
  "game": { "id": 42, "opponent": "Miami", "game_date": "...", "home_away": "home" },
  "gameState": {
    "status": "in_progress",
    "inning": 5,
    "inningHalf": "top",
    "homeScore": 3,
    "awayScore": 1,
    "outs": 2,
    "balls": 1,
    "strikes": 2,
    "runnersOn": null,
    "lastUpdate": "2026-04-15T19:45:00Z"
  },
  "statsCreated": 12,
  "statsUpdated": 0,
  "errors": []
}
```

---

### syncAll

**Purpose:** Orchestrates all sync operations in a single call. Used by the background scheduler and the "Full Sync" / "Force Sync" frontend buttons.

**Execution order:**

```
1.  syncRoster
2.  syncSchedule
3.  syncStats              ← respects force flag
4.  syncGameLog
5.  syncTeamRecord
6.  syncSeasonStats
7.  syncSplitStats
8.  syncTeamAggregateStats
9.  syncCareerStats        ← respects force flag
10. syncPlayerDetails      ← respects force flag
11. syncPlayerPhotos       ← respects force flag
12. syncHistoricalSeasonStats ← respects force flag
13. syncPlayerVideos       ← respects force flag
14. syncPressReleases
15. syncOpponentStats      ← respects force flag
```

Each step is wrapped in its own `try/catch`. A failure in step 3 does not prevent step 4 from running. Failures are collected in `results.errors[]`.

A top-level `SyncLog` of type `full` is created to summarize the entire operation. Individual sub-syncs also create their own `SyncLog` entries.

**Returns:** An object with a key per sync type, each containing that sync's individual result object.

---

## 4. Force Sync

### What the `force` flag does

The `force` flag disables TTL-based skip logic. Without it, the service skips:

- Games that already have 2+ `GameStatistic` rows (for `syncStats`)
- Games that already have `OpponentGameStat` rows (for `syncOpponentStats`)
- Players synced within the past 24 hours (for `syncCareerStats`, `syncPlayerDetails`, `syncPlayerPhotos`, `syncHistoricalSeasonStats`, `syncPlayerVideos`)

With `force=true`, all eligible records are re-fetched and re-upserted from Presto regardless of when they were last synced.

### When to use it

- **Data mismatch:** A player's stats shown in the UI don't match Presto's website — trigger a force sync to pull fresh data.
- **Recently completed game with incomplete stats:** A game completed recently but Presto's box score was not fully populated at sync time. A normal sync won't retry it (because it has enough rows to be marked "synced"). Force sync re-fetches all game stats.
- **After bulk Presto data corrections:** If PrestoSports corrects historical stats, a force sync ensures local data is refreshed.
- **New season setup:** After configuring a new `prestoSeasonId`, force sync ensures all season stats are fetched fresh.

### The 24-hour TTL

`PLAYER_SYNC_TTL_MS = 24 * 60 * 60 * 1000` (defined at the top of `prestoSyncService.js`)

For any sync operation that calls Presto per-player (career stats, player details, photos, historical stats, videos), the service checks `player.last_synced_at`. If it is more recent than 24 hours ago, the player is skipped. This prevents 30+ sequential API calls per scheduled sync for data that changes infrequently.

### Frontend "Force Sync" button

The frontend sends `force: true` in the request body to `POST /api/v1/integrations/presto/sync/all`:

```bash
curl -X POST http://localhost:5000/api/v1/integrations/presto/sync/all \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "force": true }'
```

Individual sync endpoints (e.g., `POST /api/v1/integrations/presto/sync/stats`) do not currently accept a `force` body parameter through the route — force mode is only exposed through the `syncAll` route.

---

## 5. Sync Audit Log

### SyncLog model

Every sync operation writes one or more rows to the `sync_logs` table. The model is at `/Users/leo/testcopy/sports2-backend/src/models/SyncLog.js`.

| Column | Type | Description |
|---|---|---|
| `id` | integer | Primary key |
| `team_id` | integer | FK to teams |
| `sync_type` | enum | See sync types below |
| `source_system` | enum | Always `presto` for Presto syncs |
| `api_endpoint` | string | Sanitized API path (tokens redacted) |
| `status` | enum | `started`, `completed`, `partial`, `failed` |
| `initiated_by` | integer | FK to users — null for scheduled syncs |
| `started_at` | timestamp | When the sync began |
| `completed_at` | timestamp | When the sync finished |
| `duration_ms` | integer | Total duration in milliseconds |
| `request_params` | JSONB | Parameters passed to Presto (tokens redacted) |
| `items_created` | integer | Records created |
| `items_updated` | integer | Records updated |
| `items_skipped` | integer | Records skipped (TTL, already synced, etc.) |
| `items_failed` | integer | Records that errored |
| `response_summary` | JSONB | Operation-specific summary data |
| `error_message` | text | Top-level error message (tokens redacted) |
| `item_errors` | JSONB | Array of per-item error details |

### Sync types enum

```
roster, schedule, stats, team_record, season_stats, career_stats, full,
player_details, player_photos, press_releases, historical_stats,
historical_season_stats, player_videos, live_stats
```

### Status flow

```
started
   │
   ├─ all items succeeded ────────────────────────────► completed
   │
   ├─ some items failed, some succeeded ───────────────► partial
   │
   └─ catastrophic failure (no items processed) ───────► failed
```

The status logic in `SyncLog.logComplete()`:

```javascript
if (results.failed > 0 && (results.created > 0 || results.updated > 0)) {
  status = 'partial';
} else if (results.failed > 0 && results.created === 0 && results.updated === 0) {
  status = 'failed';
} else {
  status = 'completed';
}
```

### Trigger field

The `initiated_by` column is null for scheduled syncs. The sync history endpoint derives the `trigger` field from this:

```javascript
trigger: log.initiated_by ? 'manual' : 'scheduled'
```

A `null` initiated_by means the background scheduler ran the sync. A non-null value means a user clicked "Sync" in the UI.

### Security: token sanitization

Before writing to `sync_logs`, the service sanitizes:
- `api_endpoint` — removes `token=`, `key=`, `auth=`, `Bearer ...` patterns
- `error_message` — removes JWT strings, Bearer tokens, password values
- `request_params` — redacts keys matching: password, token, idToken, accessToken, refreshToken, credentials, auth, secret

### GET /api/v1/integrations/presto/sync/history

Returns paginated sync log history for the authenticated user's team.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Page number |
| `limit` | integer | 25 | Records per page (max 100) |
| `sync_type` | string | — | Filter by sync type enum value |
| `status` | string | — | Filter by status: `started`, `completed`, `partial`, `failed` |

**Example request:**

```bash
curl "http://localhost:5000/api/v1/integrations/presto/sync/history?page=1&limit=10&sync_type=stats" \
  -H "Authorization: Bearer <jwt>"
```

**Example response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 147,
      "sync_type": "stats",
      "status": "completed",
      "trigger": "manual",
      "triggered_by": "John Smith",
      "started_at": "2026-04-15T18:00:00Z",
      "completed_at": "2026-04-15T18:02:34Z",
      "duration_ms": 154000,
      "items_created": 45,
      "items_updated": 12,
      "items_skipped": 8,
      "items_failed": 0,
      "error_message": null,
      "response_summary": { "games_processed": 5, "stats_synced": 57 }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 47,
    "pages": 5
  }
}
```

---

## 6. Stats API Endpoints

All routes require a valid JWT (`Authorization: Bearer <token>` or httpOnly cookie). All routes are scoped to the authenticated user's `team_id` — there is no way to query another team's data through these endpoints.

---

### GET /api/v1/teams/stats

Returns a high-level overview of the team's data. Useful for dashboard summary cards.

**No query parameters.**

**Response:**

```json
{
  "success": true,
  "data": {
    "totalPlayers": 32,
    "activePlayers": 28,
    "totalReports": 14,
    "totalSchedules": 2,
    "totalGames": 15,
    "wins": 9,
    "losses": 6,
    "ties": 0,
    "winRate": 0.6,
    "playerRetentionRate": 0.875
  }
}
```

- `winRate` — `wins / totalGames`, or 0 if no games
- `playerRetentionRate` — `activePlayers / totalPlayers`, or 0 if no players

---

### GET /api/v1/teams/roster

Returns active players grouped by position group.

**No query parameters.**

**Response:**

```json
{
  "success": true,
  "data": {
    "pitchers": [ { "id": 1, "first_name": "Jake", "last_name": "Burns", "position": "P", ... } ],
    "catchers": [ ... ],
    "infielders": [ ... ],
    "outfielders": [ ... ],
    "designated_hitters": [ ... ],
    "total_players": 28
  }
}
```

**Position groupings:**

| Group | Positions included |
|---|---|
| `pitchers` | P |
| `catchers` | C |
| `infielders` | 1B, 2B, 3B, SS |
| `outfielders` | LF, CF, RF, OF |
| `designated_hitters` | DH |

Players are sorted by `position ASC`, then `last_name ASC`, then `first_name ASC`. Only `status = 'active'` players are included.

**Player attributes returned:** `id`, `first_name`, `last_name`, `position`, `school_type`, `height`, `weight`, `graduation_year`, `school`, `city`, `state`, `batting_avg`, `era`, `created_at`

---

### GET /api/v1/teams/dashboard

The coach's primary dashboard. Returns team record, aggregate stats, recent game results, and season stat leaders.

**No query parameters.**

**Response:**

```json
{
  "success": true,
  "data": {
    "record": {
      "wins": 9,
      "losses": 6,
      "ties": 0,
      "conference_wins": 4,
      "conference_losses": 2
    },
    "team_batting": { "avg": ".285", "hr": 18, "rbi": 72, ... },
    "team_pitching": { "era": "3.41", "ip": "120.0", "pk": 134, ... },
    "team_fielding": { "fpct": ".978", "e": 12, ... },
    "recent_games": [
      {
        "id": 42,
        "date": "2026-04-14T18:00:00Z",
        "opponent": "Florida State",
        "home_away": "home",
        "result": "W",
        "score": "7-3",
        "game_summary": "W 7-3 (9-6)",
        "running_record": "9-6",
        "running_conference_record": "4-2"
      }
    ],
    "leaders": {
      "batting_avg": [ { "player_id": 12, "name": "Marcus Diaz", "value": "0.342" } ],
      "home_runs": [ ... ],
      "rbi": [ ... ],
      "stolen_bases": [ ... ],
      "era": [ ... ],
      "strikeouts": [ ... ]
    },
    "stats_last_synced_at": "2026-04-15T12:00:00Z"
  }
}
```

**Stat leader logic:**
- `batting_avg` — requires at least 10 at-bats (`s.at_bats >= 10`), sorted descending
- `era` — requires at least 5 innings pitched (`s.innings_pitched >= 5`), sorted ascending (lower ERA is better)
- All other leaders — no minimum threshold, top 3 sorted descending
- Leaders are drawn from `PlayerSeasonStats` with `source_system = 'presto'`, deduplicated to one row per player (most recent season)

`team_batting`, `team_pitching`, and `team_fielding` are the JSONB blobs stored by `syncTeamAggregateStats`. They are empty objects `{}` until that sync has run.

---

### GET /api/v1/teams/game-log

Returns all completed games with per-game team stats and running W-L record.

**No query parameters.**

**Response:**

```json
{
  "success": true,
  "data": {
    "games": [
      {
        "id": 42,
        "date": "2026-04-14T18:00:00Z",
        "opponent": "Florida State",
        "home_away": "home",
        "result": "W",
        "score": "7-3",
        "location": "Coral Gables, FL",
        "team_stats": { "ab": 32, "h": 10, "r": 7, ... },
        "game_summary": "W 7-3 (9-6)",
        "running_record": "9-6",
        "running_conference_record": "4-2"
      }
    ]
  }
}
```

Games are ordered by `game_date DESC`. `team_stats` is a JSONB blob populated by `syncGameLog`. It may be `null` if `syncGameLog` has not yet matched this game.

---

### GET /api/v1/teams/aggregate-stats

Returns team-level batting, pitching, and fielding totals stored on the `Team` record.

**No query parameters.**

**Response:**

```json
{
  "success": true,
  "data": {
    "batting": { "ab": 520, "r": 88, "h": 148, "hr": 18, "avg": ".285", ... },
    "pitching": { "era": "3.41", "ip": "120.0", "pk": 134, "era": "3.41", ... },
    "fielding": { "e": 12, "fpct": ".978", "po": 360, ... },
    "last_synced_at": "2026-04-15T12:00:00Z"
  }
}
```

All three objects are empty `{}` until `syncTeamAggregateStats` has run at least once. The exact keys present mirror the Presto stats field names.

---

### GET /api/v1/teams/lineup

Returns a best-effort lineup derived from the most recent completed game's box score.

**No query parameters.**

**Fallback behavior:** The endpoint checks up to 5 recent completed games (ordered by `game_date DESC`). It uses the first game that has at least 2 `GameStatistic` rows for the team. This handles the case where the most recent game's stats are incomplete (Presto box score not yet fully populated).

If no game with complete stats is found in the 5 most recent games, the response returns an empty player list with a descriptive message.

**Response (data found):**

```json
{
  "success": true,
  "data": {
    "source": "last_game",
    "game_id": 42,
    "game_date": "2026-04-14T18:00:00Z",
    "opponent": "Florida State",
    "players": [
      {
        "player_id": 7,
        "name": "Carlos Rivera",
        "jersey_number": "14",
        "position": "C",
        "photo_url": "https://...",
        "batting": { "ab": 4, "h": 2, "r": 1, "rbi": 2, "bb": 0 }
      }
    ]
  }
}
```

**Response (no complete game data):**

```json
{
  "success": true,
  "data": {
    "source": "none",
    "players": [],
    "message": "No games with complete stats found"
  }
}
```

**Position sort order in the lineup response:**

```
C → SS → 2B → 3B → 1B → LF → CF → RF → DH → P → (unknown)
```

---

## 7. Box Score XML Parsing

### Why XML

The Presto GameDay API returns game statistics in the `xml` field of the `GET /events/{eventId}/stats` response. The value is a raw XML string. The `parseBoxScoreXml()` method on `prestoSyncService` parses this string using regex (not a DOM parser) to extract player stats.

### XML structure

```xml
<bsgame eventid="12345" ...>
  <team vh="V" id="opponent_team_id" name="Opponent Name">
    <player playerId="9876" name="John Smith" pos="dh" uni="24" gp="1">
      <hitting ab="4" r="1" h="2" rbi="1" double="0" triple="0" hr="0" bb="1" so="1" sb="0" cs="0" hbp="0" sf="0" sh="0" />
      <fielding po="0" a="0" e="0" />
    </player>
  </team>
  <team vh="H" id="our_team_id" name="Our Team">
    <player playerId="1234" name="Jake Burns" pos="p" uni="18" gp="1">
      <hitting ab="0" r="0" h="0" rbi="0" ... />
      <pitching ip="6.0" h="4" r="2" er="1" bb="2" so="5" hr="0" bf="23" pitches="94" win="true" loss="false" save="false" />
      <fielding po="0" a="1" e="0" />
    </player>
  </team>
</bsgame>
```

- `vh="V"` = visiting (away) team, `vh="H"` = home team
- `<player>` elements may have both `<hitting>` and `<pitching>` if the player is a two-way player (pitcher who also batted)
- `double` is the XML attribute name for doubles (not `2b`)

### parseBoxScoreXml logic

The method uses regex to iterate `<player ...>...</player>` blocks:

1. Extract player-level attributes: `playerId`, `name`, `pos`, `uni`, `gp`
2. **Skip** if no `playerId` (bench players with no stats)
3. **Skip** if `gp === 0` or `gp === "0"` (did not participate)
4. Extract `<hitting>` attributes if present
5. Extract `<fielding>` attributes if present
6. Extract `<pitching>` attributes if present — sets `isPitcher: true` and parses W/L/S indicators
7. Push the assembled stat object to the result array

Both teams' players appear in the XML. The `syncStats` method then matches each parsed player to the local roster by `external_id = stat.playerId`. Players not in the local roster are silently skipped (opponent players).

### Attribute parsing

All XML attribute values are parsed by `parseXmlAttributes()`:

```javascript
// Numbers are stored as numbers; non-numeric strings are stored as strings
const numValue = parseFloat(value);
attrs[key] = isNaN(numValue) ? value : numValue;
```

This means numeric fields arrive as JavaScript numbers, not strings, after parsing.

---

## 8. Incomplete Data Handling

### The problem

When a game ends, Presto's system takes time to finalize box score data. In the minutes (or occasionally hours) immediately after a game completes, the `/events/{eventId}/stats` endpoint may return:

- No data at all (empty response)
- Team scores but no individual player rows
- A partial player list (pitchers only, no hitters)

If the sync runs during this window and stores whatever data is available, it would incorrectly mark the game as "fully synced" and never revisit it.

### MIN_PLAYERS_FOR_SYNCED threshold

The constant `MIN_PLAYERS_FOR_SYNCED = 2` defines the minimum number of `GameStatistic` rows a game must have to be considered "done". A game with 0 or 1 stat rows is treated as incomplete and re-synced on every subsequent run.

```javascript
// src/services/prestoSyncService.js:740-761
const MIN_PLAYERS_FOR_SYNCED = 2;
const gamesWithStats = await GameStatistic.findAll({...});
syncedGameIds = new Set(
  gamesWithStats
    .filter(s => parseInt(s.stat_count) >= MIN_PLAYERS_FOR_SYNCED)
    .map(s => s.game_id)
);
games = allGames.filter(g => !syncedGameIds.has(g.id));
```

### Lineup endpoint fallback

The `/api/v1/teams/lineup` endpoint applies the same threshold when searching for a usable game. It checks up to 5 recent completed games and uses the first one with `stats.length >= 2`.

```javascript
// src/routes/teams/stats.js:410-424
for (const game of recentGames) {
  const stats = await GameStatistic.findAll({
    where: { game_id: game.id, team_id: req.user.team_id },
    include: [{ model: Player, as: 'player', ... }]
  });
  if (stats.length >= 2) {
    lastGame = game;
    gameStats = stats;
    break;
  }
}
```

### When force sync is the answer

If a game was synced during the incomplete data window and now has exactly 1 stat row, the normal sync will re-attempt it automatically (since 1 < `MIN_PLAYERS_FOR_SYNCED`). However, if Presto's data corrects after the normal sync window has already passed, use `POST /api/v1/integrations/presto/sync/all` with `force: true` to re-fetch all completed games.

---

## 9. Background Scheduler

The sync scheduler (`src/services/syncScheduler.js`) runs two cron jobs automatically when the server starts:

| Job | Schedule | What it runs |
|---|---|---|
| Full sync | Every 4 hours (`0 */4 * * *`) | `syncAll(teamId, null, { force: false })` for every team with Presto credentials |
| Live stats | Every 2 minutes (`*/2 * * * *`) | `syncLiveStats()` for any games marked as in-progress today |

The scheduler is started in `server.js` when `NODE_ENV !== 'test'` and `DISABLE_SYNC !== 'true'`:

```javascript
// src/server.js:201-207
// Set DISABLE_SYNC=true in docker-compose to prevent automatic Presto API calls
if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_SYNC !== 'true') {
  const syncScheduler = new SyncScheduler();
  syncScheduler.start();
  app.locals.syncScheduler = syncScheduler;
}
```

Set `DISABLE_SYNC=true` in the environment to prevent automatic Presto API calls (useful for development or when testing without a live Presto connection).

Scheduled syncs have `initiated_by = null` in `SyncLog`, which is how the sync history UI distinguishes them from manual syncs.

---

## 10. Integration Endpoints Quick Reference

All endpoints are prefixed with `/api/v1/integrations`.

**Permission levels:**
- `authenticated` — any logged-in user
- `head_coach+` — requires role `head_coach` or `super_admin`

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/presto/status` | authenticated | Integration status: configured, Presto team/season IDs, token status, last sync time |
| `POST` | `/presto/configure` | head_coach+ | Save credentials, test connection, store initial tokens |
| `POST` | `/presto/test` | authenticated | Test credentials without saving them |
| `DELETE` | `/presto/disconnect` | head_coach+ | Delete credentials, clear token cache, null out last sync time |
| `GET` | `/presto/seasons` | authenticated | List accessible seasons from Presto |
| `GET` | `/presto/seasons/:seasonId/teams` | authenticated | List teams for a specific season |
| `GET` | `/presto/teams` | authenticated | List teams accessible to the authenticated Presto user |
| `PUT` | `/presto/settings` | head_coach+ | Update `prestoTeamId` and `prestoSeasonId` config |
| `GET` | `/presto/games/live` | head_coach+ | Games eligible for live stats polling |
| `GET` | `/presto/league-teams` | authenticated | All teams in the configured season with logos (for opponent logos in UI) |
| `GET` | `/presto/diagnostics` | head_coach+ | Recent request log and aggregate stats from the HTTP client |
| `GET` | `/presto/sync/history` | authenticated | Paginated sync audit log (filterable by type and status) |
| `POST` | `/presto/sync/all` | head_coach+ | Full sync — all operations. Accepts `{ force: true }` body |
| `POST` | `/presto/sync/roster` | head_coach+ | Sync player roster only |
| `POST` | `/presto/sync/schedule` | head_coach+ | Sync game schedule only |
| `POST` | `/presto/sync/stats` | head_coach+ | Sync box score stats for completed games |
| `POST` | `/presto/sync/record` | head_coach+ | Sync team W-L record |
| `POST` | `/presto/sync/season-stats` | head_coach+ | Sync current season stats per player |
| `POST` | `/presto/sync/career-stats` | head_coach+ | Sync career stats per player |
| `POST` | `/presto/sync/player-details` | head_coach+ | Sync player bio/detail profiles |
| `POST` | `/presto/sync/player-photos` | head_coach+ | Sync player headshots |
| `POST` | `/presto/sync/press-releases` | head_coach+ | Sync news/press releases |
| `POST` | `/presto/sync/historical-stats` | head_coach+ | Sync historical season-by-season stats per player |
| `POST` | `/presto/sync/player-videos` | head_coach+ | Sync player highlight videos |
| `POST` | `/presto/sync/live-stats/:gameId` | head_coach+ | Sync live stats for a specific in-progress game |
| `POST` | `/presto/sync/opponent-stats` | head_coach+ | Sync opponent player stats from box scores |

**Teams stats endpoints** (prefix: `/api/v1/teams`):

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/teams/stats` | authenticated | Team overview: player counts, game record, win rate |
| `GET` | `/teams/roster` | authenticated | Active players grouped by position |
| `GET` | `/teams/dashboard` | authenticated | Record, aggregate stats, recent games, stat leaders |
| `GET` | `/teams/game-log` | authenticated | All completed games with per-game team stats |
| `GET` | `/teams/aggregate-stats` | authenticated | Team batting/pitching/fielding totals |
| `GET` | `/teams/lineup` | authenticated | Most recent lineup from box score (fallback to up to 5 prior games) |

---

## Source Files

| File | Purpose |
|---|---|
| `/Users/leo/testcopy/sports2-backend/src/services/prestoSportsService.js` | HTTP client: httpcloak session, throttle, retry, token cache |
| `/Users/leo/testcopy/sports2-backend/src/services/prestoSyncService.js` | Business logic: all sync operations, field mapping |
| `/Users/leo/testcopy/sports2-backend/src/services/syncScheduler.js` | Background cron jobs (4-hour full sync, 2-minute live stats) |
| `/Users/leo/testcopy/sports2-backend/src/routes/integrations.js` | Integration API routes |
| `/Users/leo/testcopy/sports2-backend/src/routes/teams/stats.js` | Team stats API routes |
| `/Users/leo/testcopy/sports2-backend/src/models/SyncLog.js` | Audit log model with static helpers |

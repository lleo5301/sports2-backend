# Extended PrestoSports Stats & Coach's Dashboard — Design

**Date:** 2026-02-18
**Status:** Approved

## Overview

Extend the PrestoSports integration to capture the full 214-key stat payload, split stats (HOME/AWAY/CONFERENCE/vs-LHP/vs-RHP/situational), team aggregate stats, per-game team stats (game log), and a coach's dashboard endpoint. Also add a best-effort lineup endpoint derived from box score data.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Split/raw stat storage | JSONB columns on existing tables | Zero migration when Presto adds fields; Postgres JSON operators for querying; minimal schema churn |
| Game log storage | JSONB on `games` table | 1:1 mapping with existing games; avoids JOINs |
| Team aggregate storage | JSONB on `teams` table | Single query for dashboard; simple |
| Sync schedule | Auto-sync on existing 4-hour cycle | Splits change slowly but staying fresh is worth ~5 extra API calls |
| Lineup source | Derived from last game box score + depth chart | Presto `starter` field unreliable for NJCAA |

## Database Schema Changes

Single migration: `YYYYMMDD-add-extended-presto-stats.js`

### player_season_stats

| Column | Type | Purpose |
|--------|------|---------|
| `raw_stats` | `JSONB` | Full 214-key Presto stats object (overall/default split) |
| `split_stats` | `JSONB` | Keyed by split type (see structure below) |

`split_stats` structure:
```json
{
  "home": { "ab": "14", "h": "2", "avg": ".143", ... },
  "away": { "ab": "26", "h": "8", "avg": ".308", ... },
  "conference": { "ab": "11", "h": "5", "avg": ".500", ... },
  "vs_lhp": { "ab": "6", "h": "1", "avg": ".167", ... },
  "vs_rhp": { "ab": "19", "h": "2", "avg": ".105", ... },
  "risp": { "ab": "8", "h": "2", "avg": ".250", ... },
  "two_outs": { "ab": "10", "h": "3", "avg": ".300", ... },
  "bases_loaded": { "ab": "2", "h": "1", "avg": ".500", ... },
  "bases_empty": { "ab": "16", "h": "1", "avg": ".063", ... },
  "leadoff": { "ab": "10", "h": "4", "avg": ".400", ... }
}
```

The vs-LHP/RHP and situational keys (RISP, 2-out, bases loaded, leadoff, bases empty) are extracted from fields already present in every Presto response (`hittingvsleftab`, `hittingw2outsab`, etc.), not from separate API calls.

HOME/AWAY/CONFERENCE require separate API calls with the `options` query parameter.

### games

| Column | Type | Purpose |
|--------|------|---------|
| `team_stats` | `JSONB` | Per-game team batting/pitching/fielding stats |
| `opponent_stats` | `JSONB` | Per-game opponent stats (from same response) |
| `game_summary` | `STRING(100)` | e.g., "W, 5-3" |
| `running_record` | `STRING(20)` | e.g., "15-8" at time of game |
| `running_conference_record` | `STRING(20)` | e.g., "8-4" |

### teams

| Column | Type | Purpose |
|--------|------|---------|
| `team_batting_stats` | `JSONB` | Aggregate team batting from `getTeamStats()` |
| `team_pitching_stats` | `JSONB` | Aggregate team pitching |
| `team_fielding_stats` | `JSONB` | Aggregate team fielding |
| `stats_last_synced_at` | `DATE` | Last refresh timestamp |

## Sync Service Changes

### New Methods in prestoSyncService.js

1. **`syncSplitStats(teamId)`**
   - Calls `getTeamPlayerStats(token, prestoTeamId, { options: 'HOME' })`, repeat for AWAY, CONFERENCE
   - For each player, extracts situational keys from the default response into named splits
   - Upserts `player_season_stats.split_stats` JSONB
   - Situational key extraction mapping:
     - `vs_lhp`: `hittingvsleftab`, `hittingvslefth`, `hittingvsleftpct` (and pitching equivalents)
     - `vs_rhp`: `hittingvsrightab`, `hittingvsrighth`, `hittingvsrightpct`
     - `risp`: `hittingrbi3rd`, `hittingrbi3rdno`, `hittingrbi3rdops`, `hittingrbi3rdpct`
     - `two_outs`: `hittingw2outsab`, `hittingw2outsh`, `hittingw2outspct`
     - `bases_loaded`: `hittingwloadedab`, `hittingwloadedh`, `hittingwloadedpct`
     - `bases_empty`: `hittingemptyab`, `hittingemptyh`, `hittingemptypct`
     - `leadoff`: `hittingleadoff`, `hittingleadoffno`, `hittingleadoffops`, `hittingleadoffpct`
     - `with_runners`: `hittingwrunnersab`, `hittingwrunnersh`, `hittingwrunnerspct`

2. **`syncTeamAggregateStats(teamId)`**
   - Calls `getTeamStats(token, prestoTeamId)`
   - Splits the flat stats object into batting/pitching/fielding groups
   - Stores on `teams` table

3. **`syncGameLog(teamId)`**
   - Calls `getTeamEventStats(token, prestoTeamId)`
   - Matches Presto events to local games by `presto_event_id`
   - Stores `team_stats`, `game_summary`, `running_record`, `running_conference_record`

4. **Update `syncSeasonStats()`**
   - Also save `raw_stats` JSONB alongside existing structured columns

5. **Update `syncAll()`**
   - Add `syncSplitStats`, `syncTeamAggregateStats`, `syncGameLog` to the cycle

## API Endpoints

All under `/api/v1/`, all require authentication via `protect` middleware.

### Player Endpoints

#### GET /api/v1/players/:id/splits

Returns split stats for a player.

Query params: `split` (optional) — filter to specific split type.

```json
{
  "success": true,
  "data": {
    "player_id": 1,
    "player_name": "Jendy Gonzalez",
    "season": "2025-26",
    "splits": {
      "overall": { "ab": "50", "h": "15", "avg": ".300", "ops": ".788" },
      "home": { "ab": "14", "h": "2", "avg": ".143", "ops": ".476" },
      "away": { "ab": "26", "h": "8", "avg": ".308", "ops": ".806" },
      "conference": { "ab": "11", "h": "5", "avg": ".500" },
      "vs_lhp": { "ab": "6", "h": "1", "pct": ".167" },
      "vs_rhp": { "ab": "19", "h": "2", "pct": ".105" },
      "risp": { "ab": "8", "h": "2", "pct": ".250" },
      "two_outs": { "ab": "10", "h": "3", "pct": ".300" },
      "bases_loaded": { "ab": "2", "h": "1", "pct": ".500" }
    }
  }
}
```

#### GET /api/v1/players/:id/stats/raw

Returns full 214-key raw stats object.

#### GET /api/v1/players/:id/game-log

Returns per-game stats from `game_statistics` joined with game context.

### Team Endpoints

#### GET /api/v1/teams/dashboard

Coach's dashboard — single payload with everything needed.

```json
{
  "success": true,
  "data": {
    "record": { "wins": 15, "losses": 8, "ties": 0, "conference_wins": 8, "conference_losses": 4 },
    "team_batting": { "avg": ".272", "ops": ".714", "runs_per_game": "5.4" },
    "team_pitching": { "era": "3.57", "whip": "1.30", "k_per_9": "7.43" },
    "team_fielding": { "fpct": ".952", "e": "24", "dp": "21" },
    "recent_games": [
      {
        "id": 51,
        "date": "2026-02-15",
        "opponent": "Florida SouthWestern",
        "home_away": "away",
        "result": "W",
        "score": "5-3",
        "game_summary": "W, 5-3",
        "running_record": "15-8"
      }
    ],
    "leaders": {
      "batting_avg": [{ "player_id": 1, "name": "Jendy Gonzalez", "value": ".300" }],
      "home_runs": [{ "player_id": 5, "name": "Player Name", "value": "3" }],
      "rbi": [{ "player_id": 1, "name": "Jendy Gonzalez", "value": "8" }],
      "era": [{ "player_id": 10, "name": "Pitcher Name", "value": "2.10" }],
      "strikeouts": [{ "player_id": 10, "name": "Pitcher Name", "value": "45" }]
    },
    "stats_last_synced_at": "2026-02-18T12:00:00Z"
  }
}
```

#### GET /api/v1/teams/game-log

Team game log with per-game stats, running record.

#### GET /api/v1/teams/aggregate-stats

Full team batting/pitching/fielding aggregates.

#### GET /api/v1/teams/lineup

Best-effort lineup from most recent game's box score or most recent depth chart.

## Presto API Calls Added Per Sync Cycle

| Call | Endpoint | Purpose |
|------|----------|---------|
| 1 | `getTeamPlayerStats(HOME)` | Home split |
| 2 | `getTeamPlayerStats(AWAY)` | Away split |
| 3 | `getTeamPlayerStats(CONFERENCE)` | Conference split |
| 4 | `getTeamStats()` | Team aggregates |
| 5 | `getTeamEventStats()` | Game log |

Total: 5 new API calls per 4-hour sync cycle (on top of existing ~15-20 calls).

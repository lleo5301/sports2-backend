# Extended Stats & Coach's Dashboard — API Reference

> Frontend build spec for the extended PrestoSports statistics system and Coach's Dashboard.
> All endpoints require JWT authentication (`Authorization: Bearer <token>`).
> All responses follow `{ success: boolean, data: {...} }` format.

---

## Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/teams/dashboard` | GET | Coach's dashboard: record, leaders, recent games |
| `/api/v1/teams/game-log` | GET | Team game log with per-game stats |
| `/api/v1/teams/aggregate-stats` | GET | Team batting/pitching/fielding totals |
| `/api/v1/teams/lineup` | GET | Most recent lineup from last game |
| `/api/v1/players/byId/:id/splits` | GET | Player split stats (home/away/situational) |
| `/api/v1/players/byId/:id/stats/raw` | GET | Full 214-key Presto stats object |
| `/api/v1/players/byId/:id/game-log` | GET | Player per-game stats with game context |

---

## Team Endpoints

### 1. Coach's Dashboard

```
GET /api/v1/teams/dashboard
```

The primary landing page for coaches. Returns the team's season record, aggregate stats, recent games, and stat leaders in key categories.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "record": {
      "wins": 15,             // int — overall wins
      "losses": 8,            // int — overall losses
      "ties": 0,              // int — overall ties
      "conference_wins": 10,  // int — conference wins
      "conference_losses": 4  // int — conference losses
    },

    // Team aggregate stats (JSONB from Presto — keys vary by sport)
    "team_batting": {
      "avg": ".272",
      "runs": "145",
      "hits": "230",
      "doubles": "42",
      "triples": "8",
      "home_runs": "18",
      "rbi": "132",
      "stolen_bases": "35",
      "obp": ".351",
      "slg": ".398",
      "ops": ".749"
      // ... additional Presto batting keys
    },
    "team_pitching": {
      "era": "6.02",
      "innings_pitched": "198.1",
      "strikeouts": "175",
      "walks": "89",
      "hits_allowed": "220",
      "earned_runs": "133",
      "whip": "1.56"
      // ... additional Presto pitching keys
    },
    "team_fielding": {
      "fielding_pct": ".962",
      "errors": "28",
      "putouts": "594",
      "assists": "210",
      "double_plays": "22"
      // ... additional Presto fielding keys
    },

    // Last 10 completed games, newest first
    "recent_games": [
      {
        "id": "uuid",
        "date": "2026-02-15",        // ISO date string
        "opponent": "Broward College",
        "home_away": "home",          // "home" | "away"
        "result": "W",                // "W" | "L" | "T" | null
        "score": "5-3",               // "team-opponent" format, null if not scored
        "game_summary": "W, 5-3",     // Human-readable summary
        "running_record": "15-8",     // Overall record at time of game
        "running_conference_record": "10-4" // Conference record at time of game
      }
    ],

    // Stat leaders — top 3 in each category
    "leaders": {
      "batting_avg": [
        {
          "player_id": "uuid",
          "name": "John Smith",       // "first_name last_name"
          "value": "0.385"            // String or number from Presto
        }
      ],
      "home_runs": [/* same shape */],
      "rbi": [/* same shape */],
      "stolen_bases": [/* same shape */],
      "era": [/* same shape — sorted ASC (lower is better) */],
      "strikeouts": [/* same shape */]
    },

    "stats_last_synced_at": "2026-02-18T14:30:00.000Z" // ISO datetime, null if never synced
  }
}
```

**Leader filtering rules:**
- `batting_avg`: Only players with >= 10 at-bats
- `era`: Only pitchers with >= 5 innings pitched (sorted ascending — lowest ERA first)
- All others: Sorted descending by value

**Frontend notes:**
- Display `stats_last_synced_at` as "Last updated: X ago" or similar
- `team_batting`, `team_pitching`, `team_fielding` keys come directly from Presto and may vary — display the keys you need, ignore extras
- Leaders arrays may have fewer than 3 entries if not enough qualifying players

---

### 2. Team Game Log

```
GET /api/v1/teams/game-log
```

Full game-by-game results for the season. Only completed games.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "games": [
      {
        "id": "uuid",
        "date": "2026-02-15",
        "opponent": "Broward College",
        "home_away": "home",              // "home" | "away"
        "result": "W",                    // "W" | "L" | "T"
        "score": "5-3",                   // "team-opponent" format
        "location": "Mark Light Stadium", // Venue name, may be null
        "team_stats": {                   // Per-game team stats from Presto (JSONB)
          "batting": { "avg": ".280", "runs": "5", "hits": "9", "errors": "1" },
          "pitching": { "era": "3.00", "strikeouts": "8", "walks": "2" }
          // Shape varies by what Presto returns per event
        },
        "game_summary": "W, 5-3",
        "running_record": "15-8",
        "running_conference_record": "10-4"
      }
    ]
  }
}
```

**Frontend notes:**
- Games are sorted newest first
- `team_stats` JSONB structure varies per game — build a flexible renderer
- Use `running_record` to show the team's record progression through the season

---

### 3. Team Aggregate Stats

```
GET /api/v1/teams/aggregate-stats
```

Full team-level batting, pitching, and fielding statistics. Useful for a dedicated "Team Stats" page.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "batting": {
      "avg": ".272",
      "runs": "145",
      "hits": "230",
      "doubles": "42",
      "triples": "8",
      "home_runs": "18",
      "rbi": "132",
      "stolen_bases": "35",
      "obp": ".351",
      "slg": ".398",
      "ops": ".749",
      "at_bats": "845",
      "walks": "78",
      "strikeouts": "195",
      "hit_by_pitch": "12",
      "sacrifice_hits": "8",
      "sacrifice_flies": "6"
      // ... all Presto team batting keys
    },
    "pitching": {
      "era": "6.02",
      "innings_pitched": "198.1",
      "wins": "15",
      "losses": "8",
      "saves": "3",
      "strikeouts": "175",
      "walks": "89",
      "hits_allowed": "220",
      "earned_runs": "133",
      "whip": "1.56",
      "complete_games": "2",
      "shutouts": "1"
      // ... all Presto team pitching keys
    },
    "fielding": {
      "fielding_pct": ".962",
      "errors": "28",
      "putouts": "594",
      "assists": "210",
      "double_plays": "22",
      "stolen_bases_allowed": "15",
      "caught_stealing": "8"
      // ... all Presto team fielding keys
    },
    "last_synced_at": "2026-02-18T14:30:00.000Z"
  }
}
```

**Frontend notes:**
- All stat values are **strings** from Presto (parse to numbers for display/sorting)
- These are the same objects returned in the dashboard's `team_batting`/`team_pitching`/`team_fielding` — use this endpoint for a detailed view, the dashboard for a summary
- Empty object `{}` if stats haven't been synced yet

---

### 4. Team Lineup

```
GET /api/v1/teams/lineup
```

Best-effort lineup derived from the most recent completed game's box score.

**Response (with data):**

```jsonc
{
  "success": true,
  "data": {
    "source": "last_game",              // Always "last_game" when data exists
    "game_id": "uuid",
    "game_date": "2026-02-15",
    "opponent": "Broward College",
    "players": [
      {
        "player_id": "uuid",           // May be null if player not matched
        "name": "John Smith",
        "jersey_number": "7",
        "position": "SS",              // Position played in that game
        "photo_url": "https://...",    // Player photo, may be null
        "batting": {
          "ab": 4,                     // int — at bats
          "h": 2,                      // int — hits
          "r": 1,                      // int — runs
          "rbi": 1,                    // int — RBIs
          "bb": 0                      // int — walks
        }
      }
    ]
  }
}
```

**Response (no games):**

```jsonc
{
  "success": true,
  "data": {
    "source": "none",
    "players": [],
    "message": "No completed games found"
  }
}
```

**Player sort order:** C, SS, 2B, 3B, 1B, LF, CF, RF, DH, P (defensive spectrum)

**Frontend notes:**
- This is an approximation — it shows who played last game and where, not a coach-set lineup
- Use as a starting point for lineup display; a future lineup builder feature may replace this
- `batting` values are **integers** (not strings), unlike Presto aggregate stats

---

## Player Endpoints

### 5. Player Split Stats

```
GET /api/v1/players/byId/:id/splits
```

Returns player stats broken down by situation: overall, home/away, conference, and situational splits (vs LHP/RHP, RISP, etc.).

**Response (with data):**

```jsonc
{
  "success": true,
  "data": {
    "player_id": "uuid",
    "player_name": "John Smith",
    "season": "2025-26",
    "season_name": "2025-26 Baseball",
    "splits": {
      // Overall season stats (the full 214-key Presto object)
      "overall": {
        "hittingab": "85",
        "hittingavg": ".341",
        "hittingruns": "18",
        "hittinghits": "29",
        "hittingdoubles": "6",
        "hittingtriples": "2",
        "hittinghr": "3",
        "hittingrbi": "22",
        "hittingbb": "12",
        "hittingso": "15",
        "hittingsb": "8",
        "hittingobpct": ".405",
        "hittingslgpct": ".529",
        "pitchingapp": "0"
        // ... all 214 Presto stat keys
      },

      // Location splits (from separate API calls)
      "home": {
        "hittingab": "45",
        "hittingavg": ".356",
        "hittingruns": "10",
        "hittinghits": "16"
        // ... same Presto key format
      },
      "away": { /* same shape */ },
      "conference": { /* same shape */ },

      // Situational splits (extracted from overall stats)
      "vs_lhp": {
        "ab": "25",
        "h": "9",
        "avg": ".360",
        "hr": "1",
        "rbi": "8",
        "bb": "3",
        "so": "4",
        "obp": ".414"
      },
      "vs_rhp": { /* same shape */ },
      "risp": { /* same shape */ },
      "two_outs": { /* same shape */ },
      "bases_loaded": { /* same shape */ },
      "bases_empty": { /* same shape */ },
      "leadoff": { /* same shape */ },
      "with_runners": { /* same shape */ }
    }
  }
}
```

**Response (no data):**

```jsonc
{
  "success": true,
  "data": {
    "player_id": "uuid",
    "player_name": "John Smith",
    "splits": null,
    "message": "No split stats available. Sync with PrestoSports to populate."
  }
}
```

**Split categories explained:**

| Key | Description |
|-----|-------------|
| `overall` | Full season totals (214 Presto keys) |
| `home` | Home games only |
| `away` | Away games only |
| `conference` | Conference games only |
| `vs_lhp` | Hitting vs left-handed pitchers |
| `vs_rhp` | Hitting vs right-handed pitchers |
| `risp` | Runners in scoring position |
| `two_outs` | With two outs |
| `bases_loaded` | Bases loaded |
| `bases_empty` | Bases empty |
| `leadoff` | Leadoff at-bats |
| `with_runners` | Runners on base |

**Frontend notes:**
- `overall` uses raw Presto keys (e.g., `hittingab`, `hittingavg`) — you'll need to map these to display labels
- Situational splits (`vs_lhp` through `with_runners`) use short keys (`ab`, `h`, `avg`, etc.)
- Location splits (`home`, `away`, `conference`) use raw Presto keys (same format as `overall`)
- Any split may be `undefined` if no data exists for that situation
- All values are **strings** — parse for display

---

### 6. Player Raw Stats

```
GET /api/v1/players/byId/:id/stats/raw
```

Returns the complete Presto stats payload (214 keys) for the most recent season. Useful for a detailed player stat page or for building custom stat displays.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "player_id": "uuid",
    "player_name": "John Smith",
    "season": "2025-26",
    "season_name": "2025-26 Baseball",
    "raw_stats": {
      "hittinggp": "23",
      "hittinggs": "23",
      "hittingab": "85",
      "hittingruns": "18",
      "hittinghits": "29",
      "hittingdoubles": "6",
      "hittingtriples": "2",
      "hittinghr": "3",
      "hittingrbi": "22",
      "hittingbb": "12",
      "hittingso": "15",
      "hittingsb": "8",
      "hittingcs": "2",
      "hittingavg": ".341",
      "hittingobpct": ".405",
      "hittingslgpct": ".529",
      "pitchingapp": "0",
      "pitchingera": "--",
      // ... up to 214 keys covering hitting, pitching, fielding, catching
      // Non-applicable stats show "--" or "0"
    }
  }
}
```

**Key Presto stat prefixes:**

| Prefix | Category | Example Keys |
|--------|----------|-------------|
| `hitting` | Batting | `hittingab`, `hittingavg`, `hittinghr`, `hittingrbi`, `hittingobpct` |
| `pitching` | Pitching | `pitchingapp`, `pitchingera`, `pitchingip`, `pitchingso`, `pitchingwhip` |
| `fielding` | Fielding | `fieldingpo`, `fieldinga`, `fieldinge`, `fieldingfldpct` |
| `catching` | Catching | `catchingsba`, `catchingcs`, `catchingcspct` |

**Frontend notes:**
- `raw_stats` is `null` if no Presto sync has occurred
- Values of `"--"` mean "not applicable" (e.g., pitching stats for a position player)
- Use this endpoint when you need access to every stat Presto provides
- For typical stat displays, the existing `/api/v1/players/byId/:id/stats` endpoint returns curated, typed fields — use that for standard stat cards

---

### 7. Player Game Log

```
GET /api/v1/players/byId/:id/game-log
```

Per-game statistical breakdown for an individual player across all games they participated in.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "player_id": "uuid",
    "player_name": "John Smith",
    "games": [
      {
        "game": {
          "id": "uuid",
          "opponent": "Broward College",
          "date": "2026-02-15",
          "home_away": "home",
          "result": "W",
          "score": "5-3",
          "game_summary": "W, 5-3",
          "running_record": "15-8"
        },
        "batting": {
          "ab": 4,           // int — at bats
          "r": 1,            // int — runs
          "h": 2,            // int — hits
          "doubles": 1,      // int
          "triples": 0,      // int
          "hr": 0,           // int — home runs
          "rbi": 1,          // int
          "bb": 0,           // int — walks
          "so": 1,           // int — strikeouts
          "sb": 0,           // int — stolen bases
          "hbp": 0           // int — hit by pitch
        },
        "pitching": null,    // null if player didn't pitch; object if they did:
        // {
        //   "ip": 6.0,      // float — innings pitched
        //   "h": 5,         // int — hits allowed
        //   "r": 3,         // int — runs allowed
        //   "er": 2,        // int — earned runs
        //   "bb": 2,        // int — walks
        //   "so": 7,        // int — strikeouts
        //   "hr": 1,        // int — home runs allowed
        //   "pitches": 92,  // int — pitch count
        //   "win": true,    // boolean
        //   "loss": false,  // boolean
        //   "save": false   // boolean
        // },
        "fielding": {
          "po": 3,           // int — putouts
          "a": 4,            // int — assists
          "e": 0             // int — errors
        },
        "position": "SS"     // Position played that game
      }
    ]
  }
}
```

**Frontend notes:**
- Games are sorted newest first
- `pitching` is `null` for non-pitchers (when `innings_pitched` is 0)
- `batting` and `fielding` are always present (may be all zeros)
- Values are **integers/floats** (not strings) — unlike Presto raw stats
- A player who is both a pitcher and position player will have both `batting` and `pitching` populated

---

## Data Flow & Sync

### How data gets populated

```
PrestoSports API → prestoSyncService.syncAll() → Database → API Endpoints → Frontend
```

The sync runs automatically every 4 hours and can be triggered manually. It populates:

| Sync Method | What It Fills | Used By |
|-------------|--------------|---------|
| `syncSeasonStats()` | `player_season_stats.raw_stats` | Player raw stats, splits (overall) |
| `syncSplitStats()` | `player_season_stats.split_stats` | Player splits (home/away/situational) |
| `syncTeamAggregateStats()` | `teams.team_batting_stats`, `team_pitching_stats`, `team_fielding_stats` | Dashboard, aggregate stats |
| `syncGameLog()` | `games.team_stats`, `game_summary`, `running_record` | Game log, dashboard recent games |
| `syncGameStatistics()` | `game_statistics` table | Player game log, lineup |

### Empty state handling

All endpoints return gracefully when no data has been synced:
- Dashboard returns zeros for record, empty objects for stats, empty arrays for games/leaders
- Splits returns `splits: null` with a message
- Raw stats returns `raw_stats: null`
- Game log returns `games: []`
- Lineup returns `source: "none"` with empty players array

**Frontend should show:** "Stats not yet available. Connect PrestoSports to sync." or similar empty state messaging.

---

## Presto Stat Key Reference

The most commonly needed Presto keys for building stat tables:

### Batting Display

| Display Label | Presto Key | Example |
|--------------|------------|---------|
| GP | `hittinggp` | "23" |
| AB | `hittingab` | "85" |
| R | `hittingruns` | "18" |
| H | `hittinghits` | "29" |
| 2B | `hittingdoubles` | "6" |
| 3B | `hittingtriples` | "2" |
| HR | `hittinghr` | "3" |
| RBI | `hittingrbi` | "22" |
| BB | `hittingbb` | "12" |
| SO | `hittingso` | "15" |
| SB | `hittingsb` | "8" |
| AVG | `hittingavg` | ".341" |
| OBP | `hittingobpct` | ".405" |
| SLG | `hittingslgpct` | ".529" |
| OPS | `hittingops` | ".934" |

### Pitching Display

| Display Label | Presto Key | Example |
|--------------|------------|---------|
| APP | `pitchingapp` | "12" |
| GS | `pitchinggs` | "10" |
| IP | `pitchingip` | "62.1" |
| W | `pitchingw` | "5" |
| L | `pitchingl` | "3" |
| SV | `pitchingsv` | "0" |
| H | `pitchingh` | "55" |
| R | `pitchingr` | "28" |
| ER | `pitchinger` | "22" |
| BB | `pitchingbb` | "18" |
| SO | `pitchingso` | "65" |
| ERA | `pitchingera` | "3.18" |
| WHIP | `pitchingwhip` | "1.17" |

### Fielding Display

| Display Label | Presto Key | Example |
|--------------|------------|---------|
| PO | `fieldingpo` | "45" |
| A | `fieldinga` | "82" |
| E | `fieldinge` | "3" |
| FLD% | `fieldingfldpct` | ".977" |
| DP | `fieldingdp` | "12" |

---

## Existing Endpoints (for context)

These endpoints already existed before this feature and remain unchanged:

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/players/byId/:id/stats` | Curated player season + career stats (typed fields, not raw Presto) |
| `GET /api/v1/teams/stats` | Basic team counts (players, reports, schedules, win rate) |
| `GET /api/v1/teams/roster` | Active players grouped by position |
| `GET /api/v1/players/leaderboard` | Team leaderboard for batting/pitching categories |

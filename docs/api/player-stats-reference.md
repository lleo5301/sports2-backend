# Player Stats API Reference

Complete reference for all baseball statistics available through the API, how they're stored, and how to access them.

---

## Quick Reference — Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/players/byId/:id/stats` | Player season & career stats |
| `GET` | `/api/v1/players/byId/:id/videos` | Player videos |
| `GET` | `/api/v1/games/leaderboard` | Stat leaderboard rankings |
| `GET` | `/api/v1/games/team-stats` | Team win/loss record |
| `GET` | `/api/v1/games/season-stats` | Aggregated game-by-game stats |
| `GET` | `/api/v1/games/player-stats/:playerId` | Per-game stats for a player |
| `GET` | `/api/v1/news` | News/press releases list |
| `GET` | `/api/v1/news/byId/:id` | Single news release (full content) |

All endpoints require `Authorization: Bearer <JWT>` or a valid `jwt` cookie.

---

## Data Sources

Stats come from two sources that populate different tables:

| Source | Sync Method | Tables Populated | What It Captures |
|--------|-------------|------------------|------------------|
| PrestoSports — Season Stats | `POST /api/v1/integrations/presto/sync/season-stats` | `player_season_stats` | Current season totals per player |
| PrestoSports — Career Stats | `POST /api/v1/integrations/presto/sync/career-stats` | `player_career_stats` | Aggregated career totals per player |
| PrestoSports — Historical Stats | `POST /api/v1/integrations/presto/sync/historical-stats` | `player_season_stats` | Previous seasons (backfill) |
| PrestoSports — Game Stats | `POST /api/v1/integrations/presto/sync/stats` | `game_statistics` | Per-game box score stats |
| PrestoSports — Full Sync | `POST /api/v1/integrations/presto/sync/all` | All of the above | Runs all syncs together |

---

## 1. Player Season & Career Stats

### `GET /api/v1/players/byId/:id/stats`

Returns all season stats and career totals for a player.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `season` | string | — | Filter to a specific season ID (e.g., `zsf5i61d07utporg`) |

**Response:**

```json
{
  "success": true,
  "data": {
    "player": {
      "id": 15,
      "first_name": "Xavier",
      "last_name": "Pelzer",
      "position": "P",
      "jersey_number": 5,
      "class_year": "So",
      "bats": "R",
      "throws": "R",
      "photo_url": "/uploads/photos/player-15.jpg"
    },
    "current_season": { /* most recent PlayerSeasonStats — see fields below */ },
    "seasons": [ /* all PlayerSeasonStats rows, ordered season DESC */ ],
    "career": { /* PlayerCareerStats — see fields below, or null */ }
  }
}
```

### Season Stats Fields (`player_season_stats`)

#### Identifiers

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Row ID |
| `player_id` | int | Player FK |
| `team_id` | int | Team FK |
| `season` | string | Presto season ID (e.g., `zsf5i61d07utporg`) |
| `season_name` | string | Human-readable name (e.g., `"NJCAA Baseball 2025-26"`) |
| `presto_season_id` | string | Same as `season` (explicit Presto reference) |

#### Batting — Counting Stats

| Field | Type | Presto Key | Description |
|-------|------|------------|-------------|
| `games_played` | int | `gp` | Games played |
| `games_started` | int | `gs` | Games started |
| `at_bats` | int | `ab` | At bats |
| `runs` | int | `r` | Runs scored |
| `hits` | int | `h` | Hits |
| `doubles` | int | `dsk` | Doubles (2B) |
| `triples` | int | `3b` | Triples (3B) |
| `home_runs` | int | `hr` | Home runs |
| `rbi` | int | `rbi` | Runs batted in |
| `walks` | int | `bb` | Walks (base on balls) |
| `strikeouts` | int | `k` | Strikeouts |
| `stolen_bases` | int | `sb` | Stolen bases |
| `caught_stealing` | int | `cs` | Caught stealing |
| `hit_by_pitch` | int | `hbp` | Hit by pitch |
| `sacrifice_flies` | int | `sf` | Sacrifice flies |
| `sacrifice_bunts` | int | `sh` | Sacrifice hits/bunts |

#### Batting — Rate Stats

| Field | Type | Presto Key | Description | Formula |
|-------|------|------------|-------------|---------|
| `batting_average` | decimal(4,3) | `avg` | Batting average | H / AB |
| `on_base_percentage` | decimal(4,3) | `obp` | On-base percentage | (H+BB+HBP) / (AB+BB+HBP+SF) |
| `slugging_percentage` | decimal(4,3) | `slg` | Slugging percentage | TB / AB |
| `ops` | decimal(4,3) | `ops` | On-base + slugging | OBP + SLG |

> **Note:** Rate stats are `null` when the player has 0 at-bats (e.g., pitchers who don't hit). Decimal fields come back as **strings** from Sequelize — use `parseFloat()` on the frontend.

#### Pitching — Counting Stats

| Field | Type | Presto Key | Description |
|-------|------|------------|-------------|
| `pitching_appearances` | int | `pgp` | Pitching appearances |
| `pitching_starts` | int | `pgs` | Pitching starts |
| `innings_pitched` | decimal(5,1) | `ip` | Innings pitched (e.g., `8.1` = 8⅓ IP) |
| `pitching_wins` | int | `pw` | Wins |
| `pitching_losses` | int | `pl` | Losses |
| `saves` | int | `sv` | Saves |
| `holds` | int | `hd` | Holds |
| `hits_allowed` | int | `ph` | Hits allowed |
| `runs_allowed` | int | `pr` | Runs allowed |
| `earned_runs` | int | `er` | Earned runs |
| `walks_allowed` | int | `pbb` | Walks allowed (BB) |
| `strikeouts_pitching` | int | `pk` | Strikeouts (pitching) |
| `home_runs_allowed` | int | `phr` | Home runs allowed |

#### Pitching — Rate Stats

| Field | Type | Presto Key | Description | Formula |
|-------|------|------------|-------------|---------|
| `era` | decimal(5,2) | `era` | Earned run average | (ER * 9) / IP |
| `whip` | decimal(4,2) | `whip` | Walks + hits per IP | (BB + H) / IP |
| `k_per_9` | decimal(4,2) | `kavg` | Strikeouts per 9 innings | (K * 9) / IP |
| `bb_per_9` | decimal(4,2) | `bbavg` | Walks per 9 innings | (BB * 9) / IP |

> **Note:** Pitching rate stats are `null` when `innings_pitched` is 0.

#### Fielding Stats

| Field | Type | Presto Key | Description |
|-------|------|------------|-------------|
| `fielding_games` | int | `gp` | Fielding games |
| `putouts` | int | `po` | Putouts |
| `assists` | int | `a` | Assists |
| `errors` | int | `e` | Errors |
| `fielding_percentage` | decimal(4,3) | `fpct` | Fielding % = (PO+A) / (PO+A+E) |

### Career Stats Fields (`player_career_stats`)

Career stats aggregate across all seasons. One row per player.

| Field | Type | Description |
|-------|------|-------------|
| `seasons_played` | int | Number of seasons |
| `career_games` | int | Total games |
| `career_at_bats` | int | Total at bats |
| `career_runs` | int | Total runs |
| `career_hits` | int | Total hits |
| `career_doubles` | int | Total doubles |
| `career_triples` | int | Total triples |
| `career_home_runs` | int | Total home runs |
| `career_rbi` | int | Total RBI |
| `career_walks` | int | Total walks |
| `career_strikeouts` | int | Total strikeouts |
| `career_stolen_bases` | int | Total stolen bases |
| `career_batting_average` | decimal(4,3) | Career batting avg |
| `career_obp` | decimal(4,3) | Career on-base % |
| `career_slg` | decimal(4,3) | Career slugging % |
| `career_ops` | decimal(4,3) | Career OPS |
| `career_pitching_appearances` | int | Career pitching apps |
| `career_innings_pitched` | decimal(6,1) | Career IP |
| `career_wins` | int | Career wins |
| `career_losses` | int | Career losses |
| `career_saves` | int | Career saves |
| `career_earned_runs` | int | Career earned runs |
| `career_strikeouts_pitching` | int | Career pitching K |
| `career_era` | decimal(5,2) | Career ERA |
| `career_whip` | decimal(4,2) | Career WHIP |

---

## 2. Leaderboard

### `GET /api/v1/games/leaderboard`

Returns ranked player leaders for a specific stat.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `stat` | string | **Yes** | — | Stat to rank by (see table below) |
| `season` | string | No | Most recent | Season ID to filter |
| `limit` | int | No | 10 | Max results (1-50) |
| `min_qualifier` | int | No | Varies | Override minimum qualifying value |

**Available Stats:**

| Stat | Qualifier | Default Min | Sort Order | What It Means |
|------|-----------|-------------|------------|---------------|
| `batting_average` | `at_bats` | 10 | DESC (highest first) | Best batting averages |
| `on_base_percentage` | `at_bats` | 10 | DESC | Best OBP |
| `slugging_percentage` | `at_bats` | 10 | DESC | Best slugging |
| `ops` | `at_bats` | 10 | DESC | Best OPS |
| `home_runs` | — | 0 | DESC | Most home runs |
| `rbi` | — | 0 | DESC | Most RBI |
| `hits` | — | 0 | DESC | Most hits |
| `runs` | — | 0 | DESC | Most runs scored |
| `stolen_bases` | — | 0 | DESC | Most stolen bases |
| `walks` | — | 0 | DESC | Most walks |
| `doubles` | — | 0 | DESC | Most doubles |
| `triples` | — | 0 | DESC | Most triples |
| `era` | `innings_pitched` | 5 | **ASC** (lowest first) | Best ERA |
| `whip` | `innings_pitched` | 5 | **ASC** | Best WHIP |
| `k_per_9` | `innings_pitched` | 5 | DESC | Most K/9 |
| `bb_per_9` | `innings_pitched` | 5 | **ASC** | Fewest BB/9 |
| `strikeouts_pitching` | — | 0 | DESC | Most strikeouts |
| `pitching_wins` | — | 0 | DESC | Most wins |
| `saves` | — | 0 | DESC | Most saves |
| `innings_pitched` | — | 0 | DESC | Most IP |
| `fielding_percentage` | `fielding_games` | 3 | DESC | Best fielding % |

> **Qualifiers** prevent small-sample outliers. For example, `batting_average` requires at least 10 at-bats by default. Override with `min_qualifier=0` to include everyone.

> **ASC stats** (ERA, WHIP, BB/9): Lower is better, so rank 1 = lowest value.

**Response:**

```json
{
  "success": true,
  "data": {
    "stat": "batting_average",
    "season": "zsf5i61d07utporg",
    "leaders": [
      {
        "rank": 1,
        "player": {
          "id": 27,
          "first_name": "Denixon",
          "last_name": "Suarez",
          "position": "C",
          "jersey_number": 13,
          "photo_url": null
        },
        "value": "0.333",
        "qualifier_value": 33
      }
    ]
  }
}
```

**Examples:**

```
# Top 5 batting averages (min 20 AB)
GET /api/v1/games/leaderboard?stat=batting_average&limit=5&min_qualifier=20

# ERA leaders (default: min 5 IP, sorted lowest first)
GET /api/v1/games/leaderboard?stat=era

# Home run leaders
GET /api/v1/games/leaderboard?stat=home_runs

# All-time leaders from a specific season
GET /api/v1/games/leaderboard?stat=hits&season=ei55e2a3lhb75bvp
```

---

## 3. Player Videos

### `GET /api/v1/players/byId/:id/videos`

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `video_type` | string | — | Filter: `highlight`, `game`, `interview`, `training`, `promotional`, `other` |
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page (max 50) |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Game Highlights vs Broward",
      "url": "https://...",
      "thumbnail_url": "https://...",
      "embed_url": "https://...",
      "duration": 120,
      "video_type": "highlight",
      "provider": "youtube",
      "published_at": "2026-02-10T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3, "pages": 1 }
}
```

**Sync trigger:** `POST /api/v1/integrations/presto/sync/player-videos`

---

## 4. News / Press Releases

### `GET /api/v1/news`

List news releases (excludes full `content` for performance).

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | — | Filter: `awards`, `recap`, `announcement`, `preview`, etc. |
| `player_id` | int | — | Filter by associated player |
| `search` | string | — | Case-insensitive search on title + summary |
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page (max 50) |

### `GET /api/v1/news/byId/:id`

Single release with full `content` field included.

**Sync trigger:** `POST /api/v1/integrations/presto/sync/press-releases`

---

## 5. Game-Level Stats

These endpoints read from `game_statistics` (per-game box scores), not from season totals.

### `GET /api/v1/games/team-stats`

Aggregated team record: wins, losses, win %, runs scored/allowed, etc.

### `GET /api/v1/games/season-stats`

Season-long aggregated batting/pitching stats computed from individual game box scores.

| Param | Type | Description |
|-------|------|-------------|
| `season` | string | Optional season filter |

### `GET /api/v1/games/player-stats/:playerId`

All game-by-game box score entries for a specific player.

| Param | Type | Description |
|-------|------|-------------|
| `season` | string | Optional season filter |

**Sync trigger:** `POST /api/v1/integrations/presto/sync/stats`

---

## 6. Sync Triggers

All sync endpoints require authentication + integration permission. All are `POST` requests.

| Endpoint | What It Syncs |
|----------|---------------|
| `/api/v1/integrations/presto/sync/all` | Everything below in one call |
| `/api/v1/integrations/presto/sync/season-stats` | Current season totals → `player_season_stats` |
| `/api/v1/integrations/presto/sync/career-stats` | Career totals → `player_career_stats` |
| `/api/v1/integrations/presto/sync/historical-stats` | Previous season backfill → `player_season_stats` |
| `/api/v1/integrations/presto/sync/stats` | Per-game box scores → `game_statistics` |
| `/api/v1/integrations/presto/sync/roster` | Player roster → `players` |
| `/api/v1/integrations/presto/sync/schedule` | Game schedule → `games` |
| `/api/v1/integrations/presto/sync/record` | Team W/L record → `teams` |
| `/api/v1/integrations/presto/sync/player-details` | Player bio details → `players` |
| `/api/v1/integrations/presto/sync/player-photos` | Player headshots → `players.photo_url` |
| `/api/v1/integrations/presto/sync/player-videos` | Player videos → `player_videos` |
| `/api/v1/integrations/presto/sync/press-releases` | News articles → `news_releases` |
| `/api/v1/integrations/presto/sync/live-stats/:gameId` | Live game stats (in-progress games) |

---

## Presto Field Mapping Reference

How PrestoSports API field abbreviations map to our database columns.

### Batting

| Presto Key | Our Column | Meaning |
|------------|------------|---------|
| `gp` | `games_played` | Games played |
| `gs` | `games_started` | Games started |
| `ab` | `at_bats` | At bats |
| `r` | `runs` | Runs |
| `h` | `hits` | Hits |
| `dsk` | `doubles` | Doubles |
| `3b` | `triples` | Triples |
| `hr` | `home_runs` | Home runs |
| `rbi` | `rbi` | RBI |
| `bb` | `walks` | Walks |
| `k` | `strikeouts` | Strikeouts |
| `sb` | `stolen_bases` | Stolen bases |
| `cs` | `caught_stealing` | Caught stealing |
| `hbp` | `hit_by_pitch` | Hit by pitch |
| `sf` | `sacrifice_flies` | Sacrifice flies |
| `sh` | `sacrifice_bunts` | Sacrifice bunts |
| `avg` | `batting_average` | Batting average |
| `obp` | `on_base_percentage` | On-base % |
| `slg` | `slugging_percentage` | Slugging % |
| `ops` | `ops` | OPS |

### Pitching

| Presto Key | Our Column | Meaning |
|------------|------------|---------|
| `pgp` | `pitching_appearances` | Pitching appearances |
| `pgs` | `pitching_starts` | Pitching starts |
| `ip` | `innings_pitched` | Innings pitched |
| `pw` | `pitching_wins` | Wins |
| `pl` | `pitching_losses` | Losses |
| `sv` | `saves` | Saves |
| `hd` | `holds` | Holds |
| `ph` | `hits_allowed` | Hits allowed |
| `pr` | `runs_allowed` | Runs allowed |
| `er` | `earned_runs` | Earned runs |
| `pbb` | `walks_allowed` | Walks allowed |
| `pk` | `strikeouts_pitching` | Pitching strikeouts |
| `phr` | `home_runs_allowed` | HR allowed |
| `era` | `era` | ERA |
| `whip` | `whip` | WHIP |
| `kavg` | `k_per_9` | K per 9 innings |
| `bbavg` | `bb_per_9` | BB per 9 innings |

### Fielding

| Presto Key | Our Column | Meaning |
|------------|------------|---------|
| `po` | `putouts` | Putouts |
| `a` | `assists` | Assists |
| `e` | `errors` | Errors |
| `fpct` | `fielding_percentage` | Fielding % |

---

## Frontend Tips

1. **Decimal fields are strings** — Sequelize returns `DECIMAL` as strings (e.g., `"0.333"`). Always `parseFloat()` before displaying or comparing.

2. **Null rate stats** — `batting_average`, `era`, `obp`, etc. are `null` when the player has no qualifying denominator (0 AB or 0 IP). Display as `"-"` or `"N/A"`.

3. **Season ID vs name** — Use `season_name` for display (e.g., "NJCAA Baseball 2025-26"). Use `season` (the ID) for API queries and filtering.

4. **Leaderboard qualifiers** — Default minimums prevent misleading stats (a 1-for-1 player showing 1.000 BA). The `qualifier_value` in the response shows each player's qualifying count.

5. **Two-way players** — Players who both pitch and hit will have both batting and pitching stats populated in the same row. Check `at_bats > 0` for batting display and `innings_pitched > 0` for pitching display.

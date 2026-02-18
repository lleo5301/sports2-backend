# Stats & Analytics API Reference

> New endpoints for player statistics, player videos, leaderboards, and news releases.
> All data is populated by PrestoSports sync — no manual entry required.

---

## Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/players/byId/:id/stats` | Player season & career stats |
| `GET` | `/api/v1/players/byId/:id/videos` | Player video library |
| `GET` | `/api/v1/games/leaderboard` | Stat leaderboard rankings |
| `GET` | `/api/v1/news` | News releases list |
| `GET` | `/api/v1/news/byId/:id` | Single news release (full content) |

**Auth:** All endpoints require `Authorization: Bearer <JWT>`. These are all GET (read-only) — no CSRF token needed.

---

## 1. Player Season & Career Stats

### `GET /api/v1/players/byId/:id/stats`

Returns season-by-season statistics and career totals from PrestoSports sync.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `season` | string | — | Filter to one season (e.g. `2025-26`) |

**Response — 200:**

```json
{
  "success": true,
  "data": {
    "player": {
      "id": 12,
      "first_name": "Marcus",
      "last_name": "Rivera",
      "position": "P",
      "jersey_number": 21,
      "class_year": "JR",
      "bats": "R",
      "throws": "L",
      "photo_url": "https://..."
    },
    "current_season": {
      "id": 45,
      "season": "2025-26",
      "games_played": 30,
      "at_bats": 110,
      "hits": 38,
      "home_runs": 10,
      "rbi": 28,
      "batting_average": "0.345",
      "on_base_percentage": "0.410",
      "slugging_percentage": "0.580",
      "ops": "0.990",
      "innings_pitched": "50.0",
      "pitching_wins": 6,
      "pitching_losses": 1,
      "era": "2.80",
      "whip": "1.05",
      "k_per_9": "10.50",
      "bb_per_9": "2.50",
      "fielding_percentage": "0.975",
      "source_system": "presto",
      "...": "all PlayerSeasonStats fields"
    },
    "seasons": [
      { "season": "2025-26", "...": "same shape as current_season" },
      { "season": "2024-25", "...": "older season" }
    ],
    "career": {
      "seasons_played": 2,
      "career_games": 70,
      "career_at_bats": 260,
      "career_hits": 83,
      "career_home_runs": 18,
      "career_rbi": 58,
      "career_batting_average": "0.319",
      "career_obp": "0.390",
      "career_slg": "0.550",
      "career_ops": "0.940",
      "career_era": "3.10",
      "career_whip": "1.15",
      "...": "all PlayerCareerStats fields"
    }
  }
}
```

**Important notes for frontend:**
- `current_season` is the first element of `seasons` (most recent by season name DESC). Will be `null` if no stats synced.
- `career` is `null` if no career stats exist.
- Decimal fields (`batting_average`, `era`, etc.) come as strings from Sequelize `DECIMAL` type — parse with `parseFloat()` or `Number()`.
- `seasons` is ordered DESC (newest first).

**Error responses:**
- `404` — Player not found or not on user's team
- `401` — Missing auth token

---

## 2. Player Videos

### `GET /api/v1/players/byId/:id/videos`

Returns paginated videos synced from PrestoSports.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `video_type` | string | — | Filter: `highlight`, `game`, `interview`, `training`, `promotional`, `other` |
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max 50) |

**Response — 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "player_id": 12,
      "team_id": 1,
      "title": "Highlight Reel",
      "description": "Season highlights...",
      "url": "https://youtube.com/watch?v=...",
      "thumbnail_url": "https://img.youtube.com/...",
      "embed_url": "https://youtube.com/embed/...",
      "duration": 185,
      "video_type": "highlight",
      "provider": "youtube",
      "provider_video_id": "abc123",
      "published_at": "2026-01-15T00:00:00.000Z",
      "view_count": 1250,
      "source_system": "presto"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "pages": 1
  }
}
```

**Frontend integration tips:**
- Use `embed_url` for inline video players (YouTube/Vimeo embeds).
- Fall back to `url` as a link if `embed_url` is null.
- `thumbnail_url` is suitable for video cards/grids.
- `duration` is in seconds — format as `mm:ss` for display.
- Videos are ordered by `published_at DESC` (newest first).
- `video_type` values match `PlayerVideo.VIDEO_TYPES` enum — good candidates for tab filters.

---

## 3. Leaderboard

### `GET /api/v1/games/leaderboard`

Returns ranked player leaders for a specific stat. Mounted under `/games` because leaderboards are derived from season stats in the game/stats domain.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `stat` | string | **yes** | — | Stat to rank by (see whitelist below) |
| `season` | string | no | most recent | Season filter (e.g. `2025-26`) |
| `limit` | integer | no | 10 | Max leaders (1-50) |
| `min_qualifier` | integer | no | varies | Override minimum qualifying value |

**Stat Whitelist:**

| Stat | Category | Default Sort | Qualifier | Default Min |
|------|----------|-------------|-----------|-------------|
| `batting_average` | Batting | DESC | `at_bats` | 10 |
| `on_base_percentage` | Batting | DESC | `at_bats` | 10 |
| `slugging_percentage` | Batting | DESC | `at_bats` | 10 |
| `ops` | Batting | DESC | `at_bats` | 10 |
| `home_runs` | Batting | DESC | — | 0 |
| `rbi` | Batting | DESC | — | 0 |
| `hits` | Batting | DESC | — | 0 |
| `runs` | Batting | DESC | — | 0 |
| `stolen_bases` | Batting | DESC | — | 0 |
| `walks` | Batting | DESC | — | 0 |
| `doubles` | Batting | DESC | — | 0 |
| `triples` | Batting | DESC | — | 0 |
| `era` | Pitching | **ASC** | `innings_pitched` | 5 |
| `whip` | Pitching | **ASC** | `innings_pitched` | 5 |
| `k_per_9` | Pitching | DESC | `innings_pitched` | 5 |
| `bb_per_9` | Pitching | **ASC** | `innings_pitched` | 5 |
| `strikeouts_pitching` | Pitching | DESC | — | 0 |
| `pitching_wins` | Pitching | DESC | — | 0 |
| `saves` | Pitching | DESC | — | 0 |
| `innings_pitched` | Pitching | DESC | — | 0 |
| `fielding_percentage` | Fielding | DESC | `fielding_games` | 3 |

**Response — 200:**

```json
{
  "success": true,
  "data": {
    "stat": "batting_average",
    "season": "2025-26",
    "leaders": [
      {
        "rank": 1,
        "player": {
          "id": 5,
          "first_name": "Alex",
          "last_name": "Smith",
          "position": "SS",
          "jersey_number": 1,
          "photo_url": "https://..."
        },
        "value": "0.385",
        "qualifier_value": 200
      },
      {
        "rank": 2,
        "player": { "...": "..." },
        "value": "0.350",
        "qualifier_value": 180
      }
    ]
  }
}
```

**Frontend integration tips:**
- `value` is the stat value — comes as a string for decimals, integer for counting stats.
- `qualifier_value` is null for stats without qualifiers (home_runs, rbi, etc.).
- For rate stats (batting_average, era, etc.), display `value` with appropriate precision (`.345`, `2.80`).
- Consider grouping stats by category (Batting / Pitching / Fielding) in a dropdown/tab UI.
- The `season` in response tells you which season was used — helpful for display headers.
- If `season` is null and `leaders` is empty, no stats have been synced yet.

**Error responses:**
- `400` — Missing `stat` param, or `stat` not in whitelist, or `limit` out of range

---

## 4. News Releases

### `GET /api/v1/news` — List News

Returns paginated news releases. The `content` field is **excluded** from the list response for performance — use the detail endpoint for full content.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | — | Filter by category (e.g. `recap`, `awards`, `announcement`, `preview`) |
| `player_id` | integer | — | Filter by associated player |
| `search` | string | — | Case-insensitive search on title + summary |
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max 50) |

**Response — 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "team_id": 1,
      "title": "Rivera Named Player of the Week",
      "summary": "Rivera earned the honor after a 3-HR game.",
      "author": "Sports Information",
      "publish_date": "2026-02-15T00:00:00.000Z",
      "category": "awards",
      "image_url": "https://...",
      "source_url": "https://prestosports.com/...",
      "player_id": 12,
      "player": {
        "id": 12,
        "first_name": "Marcus",
        "last_name": "Rivera"
      },
      "source_system": "presto",
      "createdAt": "2026-02-15T12:00:00.000Z",
      "updatedAt": "2026-02-15T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

### `GET /api/v1/news/byId/:id` — Single News Release

Returns the full news release including the `content` field.

**Response — 200:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "team_id": 1,
    "title": "Rivera Named Player of the Week",
    "content": "<p>Full article HTML content...</p>",
    "summary": "Rivera earned the honor after a 3-HR game.",
    "author": "Sports Information",
    "publish_date": "2026-02-15T00:00:00.000Z",
    "category": "awards",
    "image_url": "https://...",
    "source_url": "https://prestosports.com/...",
    "player_id": 12,
    "player": {
      "id": 12,
      "first_name": "Marcus",
      "last_name": "Rivera"
    }
  }
}
```

**Frontend integration tips:**
- `content` may contain HTML from PrestoSports — render with `dangerouslySetInnerHTML` or a sanitizer like DOMPurify.
- `player` is `null` when the news isn't player-specific (team announcements, etc.).
- `image_url` is suitable for card thumbnails and article hero images.
- `source_url` links to the original article on PrestoSports — useful for a "Read original" link.
- News is ordered by `publish_date DESC` (newest first).
- Categories are free-form strings from PrestoSports — display existing values, don't hardcode an enum.

---

## Data Source & Sync

All data in these endpoints comes from PrestoSports sync. The `syncAll()` method now includes:

| Sync | Table | Endpoint It Feeds |
|------|-------|-------------------|
| `syncSeasonStats()` | `player_season_stats` | `/players/byId/:id/stats`, `/games/leaderboard` |
| `syncCareerStats()` | `player_career_stats` | `/players/byId/:id/stats` |
| `syncPlayerVideos()` | `player_videos` | `/players/byId/:id/videos` |
| `syncPressReleases()` | `news_releases` | `/news`, `/news/byId/:id` |
| `syncPlayerDetails()` | `players` (updates) | Player fields (class_year, bats, throws, etc.) |
| `syncPlayerPhotos()` | `players` (updates) | Player `photo_url` field |
| `syncHistoricalSeasonStats()` | `player_season_stats` | Older seasons backfill |

Sync is triggered by:
1. **Manual:** `POST /api/v1/integrations/presto/sync/all`
2. **Automatic:** SyncScheduler runs on a configurable interval

---

## Suggested Frontend Pages

### Player Profile — Stats Tab
Use `/players/byId/:id/stats` to build:
- **Current season stat line** — show `current_season` batting/pitching/fielding in a stat row
- **Season history table** — iterate `seasons` array, one row per season
- **Career totals row** — from `career` object
- **Stat sparklines** — chart `batting_average` or `era` across seasons

### Player Profile — Videos Tab
Use `/players/byId/:id/videos` to build:
- **Video grid** with thumbnail, title, duration badge
- **Type filter tabs** — highlight / game / interview / training
- **Video player modal** using `embed_url`

### Team Leaderboard Page
Use `/games/leaderboard` to build:
- **Stat category dropdown** — Batting / Pitching / Fielding groups
- **Stat selector** — batting_average, home_runs, era, etc.
- **Ranked list** with player photo, name, jersey number, stat value
- **Season toggle** for historical comparisons

### News Feed Page
Use `/news` and `/news/byId/:id` to build:
- **News feed** — card layout with image, title, summary, date, category badge
- **Category filter** and **search bar**
- **Player filter** — "News about Marcus Rivera"
- **Article detail page** — full content render with hero image

---

## TypeScript Types

```typescript
interface PlayerStatsResponse {
  player: {
    id: number;
    first_name: string;
    last_name: string;
    position: string;
    jersey_number: number | null;
    class_year: string | null;
    bats: string | null;
    throws: string | null;
    photo_url: string | null;
  };
  current_season: PlayerSeasonStats | null;
  seasons: PlayerSeasonStats[];
  career: PlayerCareerStats | null;
}

interface PlayerSeasonStats {
  id: number;
  player_id: number;
  team_id: number;
  season: string;
  // Batting
  games_played: number;
  games_started: number;
  at_bats: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  home_runs: number;
  rbi: number;
  walks: number;
  strikeouts: number;
  stolen_bases: number;
  caught_stealing: number;
  hit_by_pitch: number;
  sacrifice_flies: number;
  sacrifice_bunts: number;
  batting_average: string | null;  // DECIMAL comes as string
  on_base_percentage: string | null;
  slugging_percentage: string | null;
  ops: string | null;
  // Pitching
  pitching_appearances: number;
  pitching_starts: number;
  innings_pitched: string;  // DECIMAL
  pitching_wins: number;
  pitching_losses: number;
  saves: number;
  holds: number;
  hits_allowed: number;
  runs_allowed: number;
  earned_runs: number;
  walks_allowed: number;
  strikeouts_pitching: number;
  home_runs_allowed: number;
  era: string | null;
  whip: string | null;
  k_per_9: string | null;
  bb_per_9: string | null;
  // Fielding
  fielding_games: number;
  putouts: number;
  assists: number;
  errors: number;
  fielding_percentage: string | null;
  // Meta
  source_system: 'manual' | 'presto';
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PlayerCareerStats {
  id: number;
  player_id: number;
  seasons_played: number;
  career_games: number;
  career_at_bats: number;
  career_runs: number;
  career_hits: number;
  career_doubles: number;
  career_triples: number;
  career_home_runs: number;
  career_rbi: number;
  career_walks: number;
  career_strikeouts: number;
  career_stolen_bases: number;
  career_batting_average: string | null;
  career_obp: string | null;
  career_slg: string | null;
  career_ops: string | null;
  career_pitching_appearances: number;
  career_innings_pitched: string;
  career_wins: number;
  career_losses: number;
  career_saves: number;
  career_earned_runs: number;
  career_strikeouts_pitching: number;
  career_era: string | null;
  career_whip: string | null;
  source_system: 'manual' | 'presto';
}

interface PlayerVideo {
  id: number;
  player_id: number;
  team_id: number;
  title: string | null;
  description: string | null;
  url: string;
  thumbnail_url: string | null;
  embed_url: string | null;
  duration: number | null;
  video_type: 'highlight' | 'game' | 'interview' | 'training' | 'promotional' | 'other' | null;
  provider: string | null;
  provider_video_id: string | null;
  published_at: string | null;
  view_count: number | null;
  source_system: string;
  created_at: string;
  updated_at: string;
}

interface LeaderboardResponse {
  stat: string;
  season: string | null;
  leaders: LeaderEntry[];
}

interface LeaderEntry {
  rank: number;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    position: string;
    jersey_number: number | null;
    photo_url: string | null;
  };
  value: number | string;
  qualifier_value: number | null;
}

interface NewsReleaseSummary {
  id: number;
  team_id: number;
  title: string;
  summary: string | null;
  author: string | null;
  publish_date: string | null;
  category: string | null;
  image_url: string | null;
  source_url: string | null;
  player_id: number | null;
  player: { id: number; first_name: string; last_name: string } | null;
  source_system: string;
  createdAt: string;
  updatedAt: string;
}

interface NewsRelease extends NewsReleaseSummary {
  content: string | null;
}

// Standard pagination envelope
interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
```

---

## Breaking Change: `/players/byId/:id/stats`

The old endpoint tried to read batting/pitching fields directly from the Player model (`batting_avg`, `on_base_pct`, `slugging_pct`, `rbis`, etc.) — these columns **do not exist** on the Player table and always returned null.

The new endpoint reads from `PlayerSeasonStats` and `PlayerCareerStats` tables, returning a completely different response shape. If the frontend previously consumed this endpoint, it needs to be updated to the new shape documented above.

**Old shape (broken):**
```json
{ "batting": { "avg": null, "obp": null }, "pitching": { "era": null } }
```

**New shape:**
```json
{ "player": {...}, "current_season": {...}, "seasons": [...], "career": {...} }
```

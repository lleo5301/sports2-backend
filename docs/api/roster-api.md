# Roster API Reference

> Current implementation and proposed Roster feature.

---

## Current Implementation

Today the "roster" is just the Player table filtered by `status: 'active'` and `team_id`. There is no dedicated Roster entity.

### `GET /api/v1/teams/roster` — View Team Roster

Returns active players grouped by position.

```json
// Response — 200
{
  "success": true,
  "data": {
    "pitchers": [
      {
        "id": 12,
        "first_name": "Marcus",
        "last_name": "Rivera",
        "position": "P",
        "school_type": "COLL",
        "height": "6'2\"",
        "weight": 195,
        "graduation_year": 2026,
        "school": "Miami Dade College",
        "city": "Miami",
        "state": "FL",
        "batting_avg": "0.000",
        "era": "3.45"
      }
    ],
    "catchers": [...],
    "infielders": [...],
    "outfielders": [...],
    "designated_hitters": [...],
    "total_players": 35
  }
}
```

**Position grouping:**

| Group | Positions |
|-------|-----------|
| `pitchers` | P |
| `catchers` | C |
| `infielders` | 1B, 2B, 3B, SS |
| `outfielders` | LF, CF, RF, OF |
| `designated_hitters` | DH |

**Missing from response (available on Player model):** `jersey_number`, `class_year`, `bats`, `throws`, `photo_url`, `bio`, `hometown` — these fields are populated by PrestoSports sync but not yet returned by the roster endpoint.

### Player CRUD (existing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/players` | Browse players (filter, search, paginate) |
| `GET` | `/api/v1/players/byId/:id` | Single player with scouting reports |
| `POST` | `/api/v1/players` | Create player manually |
| `PUT` | `/api/v1/players/byId/:id` | Update player |
| `DELETE` | `/api/v1/players/byId/:id` | Delete player |
| `POST` | `/api/v1/players/bulk-delete` | Bulk delete |
| `GET` | `/api/v1/players/performance` | Performance rankings |
| `GET` | `/api/v1/players/stats/summary` | Team stat summary |

### PrestoSports Roster Sync (existing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/integrations/presto/sync/roster` | Pull roster from PrestoSports, upsert into Player table |

Sync uses `external_id` / `presto_player_id` as match keys. Populates extended fields: `jersey_number`, `class_year`, `bats`, `throws`, `bio`, `photo_url`, `hometown`, `high_school`, `previous_school`, `country`, `social_links`, `major`, `eligibility_year`, `roster_notes`.

---

## Proposed Feature: Named Rosters

### Motivation

Coaches need to create, name, and manage multiple rosters — not just see the current active players. Use cases:

- **Game-day rosters** — 27-man roster for a specific game or series
- **Travel rosters** — subset of players traveling to away games
- **Practice squads** — players in development, not on game-day roster
- **Historical rosters** — backfilled from PrestoSports game data to see who played when
- **Preseason / fall ball rosters** — tracking roster composition across seasons

### Key Concepts

- **Roster** — A named, typed collection of players for a team
- **RosterEntry** — A player's membership in a roster (with position, jersey number, order)
- **Source** — Whether the roster was created manually by a coach or backfilled from PrestoSports integration data
- **Roster Types** — Categorize rosters by purpose (game_day, travel, practice, season, custom)

### Proposed Data Model

#### Roster

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | int | auto | Primary key |
| `team_id` | int | yes | Team ownership (isolation) |
| `name` | string(150) | yes | Display name (e.g., "Opening Day 2026", "vs FSU - Feb 14") |
| `roster_type` | enum | yes | `game_day`, `travel`, `practice`, `season`, `custom` |
| `source` | enum | yes | `manual` (coach-created), `presto` (backfilled from integration) |
| `description` | text | no | Optional notes about this roster |
| `game_id` | int | no | FK to Game — links roster to a specific game (for game-day rosters) |
| `effective_date` | date | no | When this roster was/is in effect |
| `is_active` | bool | yes | Whether this is a current roster (default: true) |
| `created_by` | int | yes | User who created it |
| `created_at` | timestamp | auto | |
| `updated_at` | timestamp | auto | |

#### RosterEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | int | auto | Primary key |
| `roster_id` | int | yes | FK to Roster |
| `player_id` | int | yes | FK to Player |
| `position` | enum | no | Position for this roster (may differ from player's primary) |
| `jersey_number` | int | no | Jersey number for this roster |
| `order` | int | no | Display order / batting order position |
| `status` | enum | yes | `active`, `injured`, `suspended`, `inactive` |
| `notes` | text | no | Per-entry notes (e.g., "DH only", "available in relief") |
| `created_at` | timestamp | auto | |
| `updated_at` | timestamp | auto | |

**Unique constraint:** `(roster_id, player_id)` — a player can only appear once per roster.

### Proposed Endpoints

#### Roster CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/rosters` | List rosters (filter by type, source, active, game_id) |
| `GET` | `/api/v1/rosters/:id` | Get roster with all entries and player details |
| `POST` | `/api/v1/rosters` | Create a new roster |
| `PUT` | `/api/v1/rosters/:id` | Update roster metadata (name, type, description) |
| `DELETE` | `/api/v1/rosters/:id` | Delete roster and all entries |

#### Roster Entry Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/rosters/:id/players` | Add player(s) to roster |
| `PUT` | `/api/v1/rosters/:id/players/:playerId` | Update entry (position, order, status, notes) |
| `DELETE` | `/api/v1/rosters/:id/players/:playerId` | Remove player from roster |

#### Backfill from PrestoSports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/rosters/backfill` | Create rosters from historical game data |

### Proposed Request/Response Examples

#### `POST /api/v1/rosters` — Create Roster

```json
// Request
{
  "name": "vs Florida State - Feb 14",
  "roster_type": "game_day",
  "game_id": 42,
  "effective_date": "2026-02-14",
  "description": "Friday night starter: Rivera"
}

// Response — 201
{
  "success": true,
  "data": {
    "id": 1,
    "team_id": 1,
    "name": "vs Florida State - Feb 14",
    "roster_type": "game_day",
    "source": "manual",
    "game_id": 42,
    "effective_date": "2026-02-14",
    "description": "Friday night starter: Rivera",
    "is_active": true,
    "created_by": 5,
    "entries": []
  }
}
```

#### `POST /api/v1/rosters/:id/players` — Add Players

```json
// Request
{
  "players": [
    { "player_id": 12, "position": "P", "jersey_number": 21, "order": 1 },
    { "player_id": 8, "position": "C", "jersey_number": 7, "order": 2 },
    { "player_id": 15, "position": "SS", "jersey_number": 2, "order": 3 }
  ]
}

// Response — 201
{
  "success": true,
  "data": {
    "added": 3,
    "entries": [
      {
        "id": 1,
        "roster_id": 1,
        "player_id": 12,
        "position": "P",
        "jersey_number": 21,
        "order": 1,
        "status": "active",
        "Player": {
          "id": 12,
          "first_name": "Marcus",
          "last_name": "Rivera",
          "photo_url": "https://..."
        }
      }
    ]
  }
}
```

#### `GET /api/v1/rosters/:id` — View Roster

```json
// Response — 200
{
  "success": true,
  "data": {
    "id": 1,
    "name": "vs Florida State - Feb 14",
    "roster_type": "game_day",
    "source": "manual",
    "game_id": 42,
    "effective_date": "2026-02-14",
    "is_active": true,
    "description": "Friday night starter: Rivera",
    "CreatedBy": {
      "id": 5,
      "first_name": "Coach",
      "last_name": "Davis"
    },
    "Game": {
      "id": 42,
      "opponent": "Florida State",
      "game_date": "2026-02-14",
      "home_away": "home"
    },
    "entries": [
      {
        "id": 1,
        "player_id": 12,
        "position": "P",
        "jersey_number": 21,
        "order": 1,
        "status": "active",
        "notes": null,
        "Player": {
          "id": 12,
          "first_name": "Marcus",
          "last_name": "Rivera",
          "primary_position": "P",
          "height": "6'2\"",
          "weight": 195,
          "class_year": "JR",
          "photo_url": "https://...",
          "bats": "R",
          "throws": "R"
        }
      }
    ],
    "total_entries": 27
  }
}
```

#### `GET /api/v1/rosters` — List Rosters

```json
// GET /api/v1/rosters?roster_type=game_day&source=manual&is_active=true

// Response — 200
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "vs Florida State - Feb 14",
      "roster_type": "game_day",
      "source": "manual",
      "effective_date": "2026-02-14",
      "is_active": true,
      "entry_count": 27,
      "Game": {
        "id": 42,
        "opponent": "Florida State",
        "game_date": "2026-02-14"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 12,
    "pages": 1
  }
}
```

#### `POST /api/v1/rosters/backfill` — Backfill from PrestoSports

Creates rosters from historical PrestoSports game data. For each game that has box score data (event players), a `game_day` roster is created with `source: 'presto'`.

```json
// Request
{
  "game_ids": [42, 43, 44]
}
// Or backfill all games:
{
  "all": true
}

// Response — 200
{
  "success": true,
  "data": {
    "created": 3,
    "skipped": 0,
    "errors": [],
    "rosters": [
      { "id": 10, "name": "vs Florida State - Feb 14 (PrestoSports)", "game_id": 42, "entries": 27 },
      { "id": 11, "name": "vs UCF - Feb 15 (PrestoSports)", "game_id": 43, "entries": 25 },
      { "id": 12, "name": "@ FAU - Feb 16 (PrestoSports)", "game_id": 44, "entries": 26 }
    ]
  }
}
```

**Backfill behavior:**
- Names are auto-generated from game data: `"vs {opponent} - {date} (PrestoSports)"`
- `source` is set to `presto`
- `roster_type` is set to `game_day`
- `game_id` links to the corresponding Game record
- Players are matched by `external_id` / `presto_player_id`
- Skips games that already have a backfilled roster (no duplicates)
- Positions and jersey numbers come from the box score data

### Enums Reference

#### `roster_type`

| Value | Display Name | Purpose |
|-------|-------------|---------|
| `game_day` | Game Day | 27-man roster for a specific game |
| `travel` | Travel | Players traveling to away games |
| `practice` | Practice | Practice squad / developmental |
| `season` | Season | Full season roster |
| `custom` | Custom | Coach-defined custom roster |

#### `source`

| Value | Meaning |
|-------|---------|
| `manual` | Created by a coach in the app |
| `presto` | Backfilled from PrestoSports game data |

#### `entry status`

| Value | Meaning |
|-------|---------|
| `active` | Available to play |
| `injured` | On injured list |
| `suspended` | Suspended from play |
| `inactive` | Not available (other reason) |

### Typical Workflows

#### Coach creates a game-day roster

```
1. Create roster
   POST /api/v1/rosters
   { "name": "vs FSU - Feb 14", "roster_type": "game_day", "game_id": 42 }

2. Add players
   POST /api/v1/rosters/1/players
   { "players": [{ "player_id": 12, "position": "P", "order": 1 }, ...] }

3. Update an entry (player position change, injury)
   PUT /api/v1/rosters/1/players/8
   { "status": "injured", "notes": "Hamstring, day-to-day" }

4. View the roster
   GET /api/v1/rosters/1
```

#### Backfill historical rosters from PrestoSports

```
1. Backfill all games
   POST /api/v1/rosters/backfill
   { "all": true }

2. Browse backfilled rosters
   GET /api/v1/rosters?source=presto&roster_type=game_day

3. View a specific game roster
   GET /api/v1/rosters/10
```

---

## Error Responses

```json
{ "success": false, "error": "Description of what went wrong" }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation failed (bad input, duplicate player in roster) |
| 401 | Not authenticated |
| 404 | Roster or entry not found / doesn't belong to your team |
| 500 | Server error |

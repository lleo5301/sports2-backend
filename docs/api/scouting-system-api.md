# Scouting System API Reference

> Frontend developer guide for the scouting system redesign. This covers all new and changed endpoints.

## Overview: What Changed

### New Concepts

- **Prospects** — Separate from roster Players. A Prospect is someone your team is recruiting (high school, JUCO, transfer portal). They have their own CRUD, media, and scouting reports.
- **20-80 Grading Scale** — Industry-standard baseball scouting grades. All grades are stored as integers (20, 25, 30, ... 80). Teams can choose to display as letters (F through A+) via a team setting.
- **Present/Future Grades** — Every skill has two grades: what the prospect does *now* and what they *project* to become.
- **Recruiting Pipeline** — Prospects move through statuses: `identified` → `evaluating` → `contacted` → `visiting` → `offered` → `committed` → `signed` (or `passed`).

### Key Distinction: Prospect vs Player

| | Prospect | Player |
|---|---|---|
| **What** | Someone you're recruiting | Someone on your roster |
| **Endpoint** | `/api/v1/prospects` | `/api/v1/players` |
| **Has scouting reports** | Yes (via `prospect_id`) | Yes (via `player_id`) |
| **Has preference lists** | Yes (via `prospect_id`) | Yes (via `player_id`) |
| **Has game stats** | No | Yes |
| **Has depth chart** | No | Yes |

---

## Authentication

All endpoints require:
- `Authorization: Bearer <JWT>` header
- `x-csrf-token` header on state-changing requests (POST, PUT, DELETE)

Get a CSRF token first:
```
GET /api/v1/auth/csrf-token
→ { "token": "..." }
```

---

## 1. Prospects CRUD

### `POST /api/v1/prospects` — Create Prospect

**Required fields:** `first_name`, `last_name`, `primary_position`

```json
// Request
{
  "first_name": "John",
  "last_name": "Smith",
  "primary_position": "SS",
  "school_type": "HS",
  "school_name": "Lincoln High School",
  "city": "Austin",
  "state": "TX",
  "graduation_year": 2027,
  "class_year": "JR",
  "bats": "R",
  "throws": "R",
  "height": "6-1",
  "weight": 185,
  "sixty_yard_dash": 6.8,
  "fastball_velocity": 92,
  "exit_velocity": 95,
  "gpa": 3.5,
  "sat_score": 1200,
  "status": "identified",
  "notes": "Saw at PG showcase",
  "source": "Perfect Game",
  "email": "john@example.com",
  "phone": "5551234567",
  "video_url": "https://youtube.com/watch?v=...",
  "social_links": { "twitter": "@johnsmith", "instagram": "@jsmith" },
  "external_profile_url": "https://perfectgame.org/..."
}

// Response — 201
{
  "success": true,
  "data": {
    "id": 1,
    "team_id": 1,
    "created_by": 5,
    "first_name": "John",
    "last_name": "Smith",
    "primary_position": "SS",
    "status": "identified",
    // ... all fields
    "created_at": "2026-02-16T...",
    "updated_at": "2026-02-16T..."
  }
}
```

**Enums:**

| Field | Values |
|-------|--------|
| `primary_position` / `secondary_position` | `P`, `C`, `1B`, `2B`, `3B`, `SS`, `LF`, `CF`, `RF`, `OF`, `DH`, `UTL` |
| `school_type` | `HS`, `JUCO`, `D1`, `D2`, `D3`, `NAIA`, `Independent` |
| `class_year` | `FR`, `SO`, `JR`, `SR`, `GR` |
| `bats` | `L`, `R`, `S` |
| `throws` | `L`, `R` |
| `status` | `identified`, `evaluating`, `contacted`, `visiting`, `offered`, `committed`, `signed`, `passed` |
| `academic_eligibility` | `eligible`, `pending`, `ineligible`, `unknown` |

**Validation ranges:**

| Field | Range |
|-------|-------|
| `graduation_year` | 2020–2035 |
| `weight` | 100–350 |
| `gpa` | 0–4.0 |
| `sat_score` | 400–1600 |
| `act_score` | 1–36 |
| `fastball_velocity` | 40–110 |
| `exit_velocity` | 40–130 |

---

### `GET /api/v1/prospects` — List Prospects

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `school_type` | enum | Filter by school type |
| `primary_position` | enum | Filter by position |
| `status` | enum | Filter by pipeline status |
| `search` | string | Search by name, school, city, or state (case-insensitive) |
| `page` | int | Page number (default: 1) |
| `limit` | int | Results per page (default: 20, max: 100) |

```json
// GET /api/v1/prospects?status=evaluating&primary_position=SS&page=1&limit=20

// Response — 200
{
  "success": true,
  "data": [
    {
      "id": 1,
      "first_name": "John",
      "last_name": "Smith",
      "primary_position": "SS",
      "status": "evaluating",
      "school_name": "Lincoln High",
      "Creator": {
        "id": 5,
        "first_name": "Coach",
        "last_name": "Davis"
      },
      // ... all fields
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "pages": 3
  }
}
```

---

### `GET /api/v1/prospects/:id` — Get Single Prospect

Includes associated media files.

```json
// Response — 200
{
  "success": true,
  "data": {
    "id": 1,
    "first_name": "John",
    // ... all fields
    "Creator": { "id": 5, "first_name": "Coach", "last_name": "Davis" },
    "media": [
      {
        "id": 1,
        "media_type": "video",
        "url": "https://youtube.com/...",
        "title": "Showcase highlights",
        "description": null,
        "is_primary_photo": false,
        "sort_order": 0
      }
    ]
  }
}
```

---

### `PUT /api/v1/prospects/:id` — Update Prospect

Partial update — only send fields you want to change. Cannot change `team_id` or `created_by`.

```json
// Request
{
  "status": "contacted",
  "notes": "Called HS coach, scheduled campus visit"
}

// Response — 200
{ "success": true, "data": { /* updated prospect */ } }
```

---

### `DELETE /api/v1/prospects/:id` — Delete Prospect

```json
// Response — 200
{ "success": true, "message": "Prospect deleted successfully" }
```

---

## 2. Prospect Media

### `POST /api/v1/prospects/:id/media` — Upload Media

Two modes: **file upload** (multipart form) or **external URL** (JSON).

**File upload** (multipart/form-data):
```
POST /api/v1/prospects/1/media
Content-Type: multipart/form-data

file: <binary>
title: "Showcase highlights"     (optional)
description: "PG National 2026"  (optional)
```

Accepts: images (jpg, png, gif, webp), videos (mp4, mov, avi, webm), PDFs.
`media_type` is auto-detected from the file.

**External URL** (JSON):
```json
// Request
{
  "url": "https://youtube.com/watch?v=abc123",
  "media_type": "video",
  "title": "Showcase highlights",
  "description": "PG National 2026"
}
```

`media_type` is required for URLs: `video`, `photo`, or `document`.

```json
// Response — 201
{
  "success": true,
  "data": {
    "id": 1,
    "prospect_id": 1,
    "uploaded_by": 5,
    "media_type": "video",
    "file_path": null,
    "url": "https://youtube.com/watch?v=abc123",
    "title": "Showcase highlights",
    "description": "PG National 2026",
    "is_primary_photo": false,
    "sort_order": 0
  }
}
```

### `DELETE /api/v1/prospects/:id/media/:mediaId` — Delete Media

```json
// Response — 200
{ "success": true, "message": "Media deleted successfully" }
```

---

## 3. Scouting Reports (Updated)

Scouting reports now support both players and prospects, and use the 20-80 grading scale.

### Grade Scale

Grades are stored as integers in 5-point increments (20–80). The API automatically converts based on the team's `scouting_grade_scale` setting:

| Numeric | Letter | Meaning |
|---------|--------|---------|
| 80 | A+ | Elite / Hall of Fame |
| 70 | A | All-Star |
| 65 | A- | Plus-Plus |
| 60 | B+ | Plus |
| 55 | B | Above Average |
| 50 | B- | Average |
| 45 | C+ | Fringe Average |
| 40 | C | Below Average |
| 35 | C- | Well Below Average |
| 30 | D+ | Poor |
| 25 | D | Very Poor |
| 20 | F | Non-Prospect |

**Input:** You can send either numeric (60) or letter ("B+") — both are accepted. They're always stored as numeric.

**Output:** The API returns grades in whichever format the team has configured:
- Team `scouting_grade_scale = '20-80'` → response has numeric values (60)
- Team `scouting_grade_scale = 'letter'` → response has letter values ("B+")

### Grade Fields (Present/Future Pairs)

Every skill has a `_present` and `_future` grade:

| Category | Fields |
|----------|--------|
| **Overall** | `overall_present`, `overall_future`, `overall_future_potential` |
| **Hitting** | `hitting_present/future`, `bat_speed_present/future`, `raw_power_present/future`, `game_power_present/future`, `plate_discipline_present/future` |
| **Pitching** | `pitching_present/future`, `fastball_present/future`, `curveball_present/future`, `slider_present/future`, `changeup_present/future`, `command_present/future` |
| **Defense** | `fielding_present/future`, `arm_strength_present/future`, `arm_accuracy_present/future`, `range_present/future`, `hands_present/future` |
| **Athletic** | `speed_present/future`, `baserunning_present/future` |
| **Intangibles** | `intangibles_present/future`, `work_ethic_grade`, `coachability_grade`, `baseball_iq_present/future` |

### Prospect-Scoped Scouting Reports

#### `POST /api/v1/prospects/:id/scouting-reports` — Create for Prospect

```json
// Request
{
  "report_date": "2026-02-15",
  "event_type": "showcase",
  "overall_present": 50,
  "overall_future": 60,
  "hitting_present": "B-",
  "hitting_future": "B+",
  "speed_present": 55,
  "speed_future": 60,
  "sixty_yard_dash": 6.72,
  "mlb_comparison": "Marcus Semien",
  "notes": "Quick hands, advanced approach for his age"
}

// Response — 201 (team uses letter scale)
{
  "success": true,
  "data": {
    "id": 12,
    "prospect_id": 1,
    "player_id": null,
    "created_by": 5,
    "report_date": "2026-02-15",
    "event_type": "showcase",
    "overall_present": "B-",
    "overall_future": "B+",
    "hitting_present": "B-",
    "hitting_future": "B+",
    "speed_present": "B",
    "speed_future": "B+",
    "sixty_yard_dash": "6.72",
    "mlb_comparison": "Marcus Semien",
    "notes": "Quick hands, advanced approach for his age",
    "User": { "id": 5, "first_name": "Coach", "last_name": "Davis" }
  }
}
```

**`event_type` enum:** `game`, `showcase`, `practice`, `workout`, `video`

#### `GET /api/v1/prospects/:id/scouting-reports` — List for Prospect

Returns all scouting reports for a prospect, newest first.

```json
// Response — 200
{
  "success": true,
  "data": [
    { "id": 12, "prospect_id": 1, "report_date": "2026-02-15", ... },
    { "id": 8, "prospect_id": 1, "report_date": "2026-02-01", ... }
  ]
}
```

### General Scouting Endpoints (Updated)

The existing scouting endpoints at `/api/v1/reports/scouting` now accept either `player_id` or `prospect_id`.

#### `POST /api/v1/reports/scouting` — Create Report

```json
// For a prospect
{ "prospect_id": 1, "report_date": "2026-02-15", "overall_present": 50, ... }

// For a player (still works as before)
{ "player_id": 7, "report_date": "2026-02-15", "overall_present": 50, ... }
```

**Rule:** Provide exactly one of `player_id` or `prospect_id`, not both.

#### `GET /api/v1/reports/scouting` — List All Reports

Now returns reports for both players and prospects. New query filter:

| Param | Type | Description |
|-------|------|-------------|
| `prospect_id` | int | Filter to a specific prospect |
| `player_id` | int | Filter to a specific player (existing) |

---

## 4. Recruiting Board & Preference Lists (Updated)

### `GET /api/v1/recruits` — Recruiting Board

**Changed:** Now queries **Prospects** (not Players). Returns all prospects for the team, regardless of position.

```json
// Response — 200
{
  "success": true,
  "data": [
    {
      "id": 1,
      "first_name": "John",
      "last_name": "Smith",
      "primary_position": "SS",
      "school_type": "HS",
      "school_name": "Lincoln High",
      "city": "Austin",
      "state": "TX",
      "graduation_year": 2027,
      "status": "evaluating"
    }
  ],
  "pagination": { ... }
}
```

### `GET /api/v1/recruits/preference-lists` — List Preference Lists

**New `list_type` value:** `pitchers_pref_list`

All valid list types: `new_players`, `overall_pref_list`, `hs_pref_list`, `college_transfers`, `pitchers_pref_list`

Response now includes both `Player` and `Prospect` associations (exactly one will be non-null):

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "player_id": null,
      "prospect_id": 3,
      "list_type": "hs_pref_list",
      "priority": 1,
      "status": "active",
      "Player": null,
      "Prospect": {
        "id": 3,
        "first_name": "John",
        "last_name": "Smith",
        "primary_position": "SS",
        "school_type": "HS",
        "school_name": "Lincoln High",
        "city": "Austin",
        "state": "TX",
        "graduation_year": 2027
      },
      "AddedBy": { "id": 5, "first_name": "Coach", "last_name": "Davis" }
    }
  ],
  "pagination": { ... }
}
```

### `POST /api/v1/recruits/preference-lists` — Add to Preference List

Send either `player_id` or `prospect_id` (exactly one).

```json
// Add a prospect
{
  "prospect_id": 3,
  "list_type": "hs_pref_list",
  "priority": 1,
  "notes": "Top SS target"
}

// Add a player (legacy, still works)
{
  "player_id": 7,
  "list_type": "college_transfers",
  "priority": 2
}
```

---

## 5. Team Settings (New)

Teams now have a `scouting_grade_scale` field:

| Value | Effect |
|-------|--------|
| `'20-80'` (default) | Scouting report grades returned as integers |
| `'letter'` | Scouting report grades returned as letters (A+, B-, etc.) |

This setting affects all scouting report API responses for the team. It does **not** affect how grades are stored (always numeric) or accepted on input (both formats always accepted).

---

## Error Responses

All errors follow the same format:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation failed (bad input) |
| 401 | Not authenticated |
| 404 | Resource not found (or doesn't belong to your team) |
| 500 | Server error |

# Preference Lists API Reference

> Frontend developer guide for the recruiting preference list system.

## Overview

Preference lists let coaches organize and track recruiting prospects through a pipeline. Prospects (and legacy Players) can be added to categorized lists, ranked by priority, and tracked through recruiting stages.

### Key Concepts

- **Prospect vs Player** — Preference lists primarily use Prospects (recruits). Players (roster members) are supported for backward compatibility. Exactly one of `prospect_id` or `player_id` must be provided.
- **List Types** — Five categorized lists for organizing recruits
- **Priority** — Integer ranking (1-999, lower = higher priority, default 999)
- **Pipeline Status** — Tracks recruiting progress: `active` → `committed` → `signed` (or `lost`)

---

## Authentication

All endpoints require:
- `Authorization: Bearer <JWT>` header
- `x-csrf-token` header on state-changing requests (POST, PUT, DELETE)

All data is automatically scoped to the authenticated user's team.

---

## 1. Recruiting Board

### `GET /api/v1/recruits` — Browse All Prospects

Returns all prospects for the team with their current preference list memberships.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `school_type` | enum | Filter: `HS`, `JUCO`, `D1`, `D2`, `D3`, `NAIA`, `Independent` |
| `position` | enum | Filter: `P`, `C`, `1B`, `2B`, `3B`, `SS`, `LF`, `CF`, `RF`, `OF`, `DH`, `UTL` |
| `search` | string | Case-insensitive search across name, school, city, state |
| `page` | int | Page number (default: 1) |
| `limit` | int | Results per page (default: 20, max: 100) |

```json
// GET /api/v1/recruits?school_type=HS&position=SS&page=1

// Response — 200
{
  "success": true,
  "data": [
    {
      "id": 3,
      "first_name": "John",
      "last_name": "Smith",
      "primary_position": "SS",
      "school_type": "HS",
      "school_name": "Lincoln High",
      "city": "Austin",
      "state": "TX",
      "graduation_year": 2027,
      "status": "evaluating",
      "PreferenceLists": [
        {
          "list_type": "hs_pref_list",
          "priority": 5,
          "status": "active",
          "interest_level": "High"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "pages": 3
  }
}
```

**Notes:**
- `PreferenceLists` array shows which lists this prospect is already on (empty array if not on any list)
- Ordered by creation date DESC (newest prospects first)

---

## 2. Preference List Endpoints

### `GET /api/v1/recruits/preference-lists` — View a List

Returns preference list entries, sorted by priority (highest priority first).

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `list_type` | enum | Filter by list type (see enum below) |
| `status` | enum | Filter: `active`, `inactive`, `committed`, `signed`, `lost` |
| `page` | int | Page number (default: 1) |
| `limit` | int | Results per page (default: 20, max: 100) |

```json
// GET /api/v1/recruits/preference-lists?list_type=hs_pref_list&status=active

// Response — 200
{
  "success": true,
  "data": [
    {
      "id": 99,
      "player_id": null,
      "prospect_id": 3,
      "team_id": 1,
      "list_type": "hs_pref_list",
      "priority": 1,
      "status": "active",
      "interest_level": "High",
      "notes": "Strong arm, good footwork",
      "contact_notes": "Called HS coach, interested in visit",
      "visit_scheduled": true,
      "visit_date": "2026-03-15",
      "scholarship_offered": false,
      "scholarship_amount": null,
      "last_contact_date": "2026-02-10",
      "next_contact_date": "2026-02-24",
      "transfer_reason": null,
      "eligibility_remaining": null,
      "academic_standing": null,
      "added_date": "2026-02-01T10:30:00Z",
      "added_by": 5,
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
      "AddedBy": {
        "id": 5,
        "first_name": "Coach",
        "last_name": "Davis"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "pages": 1
  }
}
```

**Notes:**
- Sorted by `priority` ASC (1 = top), then `added_date` DESC
- Exactly one of `Player` or `Prospect` will be non-null

---

### `POST /api/v1/recruits/preference-lists` — Add to List

**Required:** `list_type` and exactly one of `prospect_id` or `player_id`.

```json
// Request
{
  "prospect_id": 3,
  "list_type": "hs_pref_list",
  "priority": 5,
  "interest_level": "High",
  "notes": "Saw at PG showcase, strong arm",
  "visit_scheduled": false,
  "scholarship_offered": false
}

// Response — 201
{
  "success": true,
  "data": {
    "id": 99,
    "prospect_id": 3,
    "player_id": null,
    "team_id": 1,
    "list_type": "hs_pref_list",
    "priority": 5,
    "status": "active",
    "interest_level": "High",
    "notes": "Saw at PG showcase, strong arm",
    "added_by": 5,
    "added_date": "2026-02-17T14:22:00Z",
    "Prospect": { "id": 3, "first_name": "John", "last_name": "Smith", ... },
    "Player": null,
    "AddedBy": { "id": 5, "first_name": "Coach", "last_name": "Davis" }
  }
}
```

**All Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prospect_id` | int | One of these | Prospect to add |
| `player_id` | int | required | Player to add (legacy) |
| `list_type` | enum | Yes | Which list (see enum below) |
| `priority` | int | No | Rank 1-999 (default: 999) |
| `interest_level` | enum | No | `High`, `Medium`, `Low`, `Unknown` |
| `notes` | string | No | General notes |
| `visit_scheduled` | bool | No | Visit planned? |
| `visit_date` | date | No | ISO date string |
| `scholarship_offered` | bool | No | Scholarship offered? |
| `scholarship_amount` | float | No | Dollar amount (min: 0) |

**Validation:**
- Providing both `prospect_id` and `player_id` → 400 error
- Providing neither → 400 error
- Duplicate (same prospect + list_type + team) → 400 error: "already in this preference list"
- Prospect/Player not found or wrong team → 404 error

---

### `PUT /api/v1/recruits/preference-lists/:id` — Update Entry

Partial update — only send fields you want to change.

```json
// Request
{
  "priority": 1,
  "status": "committed",
  "interest_level": "High",
  "scholarship_offered": true,
  "scholarship_amount": 15000.00,
  "last_contact_date": "2026-02-17",
  "next_contact_date": "2026-03-03",
  "contact_notes": "Verbal commitment received"
}

// Response — 200
{
  "success": true,
  "data": { /* full updated entry with associations */ }
}
```

**Updatable Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `priority` | int | Rank 1-999 |
| `status` | enum | `active`, `inactive`, `committed`, `signed`, `lost` |
| `interest_level` | enum | `High`, `Medium`, `Low`, `Unknown` |
| `notes` | string | General notes |
| `contact_notes` | string | Contact history |
| `visit_scheduled` | bool | Visit planned? |
| `visit_date` | date | ISO date string |
| `scholarship_offered` | bool | Scholarship offered? |
| `scholarship_amount` | float | Dollar amount |
| `last_contact_date` | date | Last contact ISO date |
| `next_contact_date` | date | Next planned contact ISO date |

---

### `DELETE /api/v1/recruits/preference-lists/:id` — Remove from List

Hard delete — removes the preference list entry. Does NOT delete the prospect.

```json
// Response — 200
{
  "success": true,
  "message": "Player removed from preference list successfully"
}
```

---

## 3. Enums Reference

### `list_type` — List Categories

| Value | Display Name | Purpose |
|-------|-------------|---------|
| `new_players` | New Players | Recently identified, not yet evaluated |
| `overall_pref_list` | Overall Preference List | Master recruiting board across all categories |
| `hs_pref_list` | High School Preference List | High school recruit targets |
| `college_transfers` | College Transfers | Transfer portal candidates |
| `pitchers_pref_list` | Pitchers Preference List | Pitcher-specific recruiting |

### `status` — Recruiting Pipeline

| Value | Meaning | Typical Flow |
|-------|---------|-------------|
| `active` | Actively recruiting | Default when added to list |
| `inactive` | On hold / deprioritized | Paused recruiting effort |
| `committed` | Verbal commitment received | Prospect has committed |
| `signed` | NLI signed | Recruiting complete |
| `lost` | Went to another school | Prospect chose elsewhere |

### `interest_level` — How interested the team is

| Value | Meaning |
|-------|---------|
| `High` | Top target |
| `Medium` | Interested but evaluating |
| `Low` | Monitoring |
| `Unknown` | Not yet assessed |

### `academic_standing` — Transfer portal field

| Value | Meaning |
|-------|---------|
| `Good` | In good academic standing |
| `Warning` | Academic warning |
| `Probation` | On academic probation |
| `Unknown` | Not yet verified |

---

## 4. Typical Workflow

```
1. Browse prospects
   GET /api/v1/recruits?school_type=HS&search=Smith

2. Add to a preference list
   POST /api/v1/recruits/preference-lists
   { "prospect_id": 3, "list_type": "hs_pref_list", "priority": 5 }

3. View the list
   GET /api/v1/recruits/preference-lists?list_type=hs_pref_list

4. Update as recruiting progresses
   PUT /api/v1/recruits/preference-lists/99
   { "status": "committed", "scholarship_offered": true, "scholarship_amount": 15000 }

5. Remove if no longer recruiting
   DELETE /api/v1/recruits/preference-lists/99
```

---

## 5. Priority / Reordering

Priority is managed per-entry via the `priority` field (1 = top, 999 = bottom). To reorder a list:

1. Fetch the list: `GET /api/v1/recruits/preference-lists?list_type=hs_pref_list`
2. Update each entry's priority: `PUT /api/v1/recruits/preference-lists/:id` with `{ "priority": N }`

Results are always returned sorted by priority ASC, so the frontend just needs to update priority values and re-fetch.

> **Note:** There is no batch reorder endpoint. Each priority change requires a separate PUT call. If drag-and-drop reordering is needed, the frontend should send individual PUT requests for each moved entry.

---

## Error Responses

```json
{ "success": false, "error": "Description of what went wrong" }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation failed (bad input, duplicate entry, missing fields) |
| 401 | Not authenticated |
| 404 | Entry not found or doesn't belong to your team |
| 500 | Server error |

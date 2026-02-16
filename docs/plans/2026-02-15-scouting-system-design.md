# Scouting System Redesign: Prospects, Preference Lists, and Grading

**Date:** 2026-02-15
**Status:** Approved
**Author:** Claude Opus 4.6 + Leo

## Problem Statement

The current scouting and recruiting system has three structural gaps:

1. **No prospect/roster separation** — external players being scouted must be created as `Player` records, polluting the team roster with non-team-members.
2. **Non-standard grading** — the scouting report uses letter grades (A+ to F), while the baseball industry uses the 20-80 scale. No support for present/future dual grades.
3. **Incomplete recruiting pipeline** — preference lists exist but lack a pitchers category, and the recruiting board queries the wrong table for prospect data.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Prospect storage | Separate `prospects` table | Clean separation from roster players; different field requirements |
| Grading system | Support both 20-80 and letter scales | Team-level setting; stored as integers internally for analytics |
| Dual grades | Present + Future per tool | Industry standard for player projection ([Baseball America](https://www.baseballamerica.com/stories/explaining-the-20-80-baseball-scouting-scale/)) |
| Pref list types | Add `pitchers_pref_list` | Pitchers are critical recruiting targets; current board excludes them |
| Scouting report target | Polymorphic FK (player_id OR prospect_id) | Reports can evaluate roster players or external prospects |
| Prospect media | Separate `prospect_media` table | Supports multiple videos/photos per prospect with upload + external URLs |

## References

- [Baseball America: The 20-80 Scouting Scale](https://www.baseballamerica.com/stories/explaining-the-20-80-baseball-scouting-scale/) — Industry-standard grading system
- [Grantland: How to Write a Scouting Report](https://grantland.com/the-triangle/baseball-scout-school-part-3-how-to-write-a-scouting-report/) — Professional report structure with present/future grades and OFP
- [MLB.com: Scouting Grades Glossary](https://www.mlb.com/glossary/miscellaneous/scouting-grades) — Official MLB grade definitions
- [NCSA: College Baseball Recruiting Guidelines](https://www.ncsasports.org/baseball/recruiting-guidelines) — Position-specific evaluation criteria
- [Prep Baseball Report](https://www.prepbaseballreport.com/recruiting-essentials) — Recruiting board and prospect tracking workflows

---

## 1. New `prospects` Table

External players being evaluated for recruiting. Separate from the `players` table which holds roster members.

### Fields

```sql
CREATE TABLE prospects (
  id              SERIAL PRIMARY KEY,
  team_id         INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by      INTEGER NOT NULL REFERENCES users(id),

  -- Identity
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(255),
  phone           VARCHAR(20),
  photo_url       VARCHAR(500),

  -- School Info
  school_type     VARCHAR(20) NOT NULL DEFAULT 'HS',
    -- ENUM: 'HS', 'JUCO', 'D1', 'D2', 'D3', 'NAIA', 'Independent'
  school_name     VARCHAR(200),
  city            VARCHAR(100),
  state           VARCHAR(50),
  graduation_year INTEGER,
  class_year      VARCHAR(5),
    -- ENUM: 'FR', 'SO', 'JR', 'SR', 'GR'

  -- Baseball Profile
  primary_position   VARCHAR(5) NOT NULL,
    -- ENUM: 'P','C','1B','2B','3B','SS','LF','CF','RF','OF','DH','UTL'
  secondary_position VARCHAR(5),
  bats            VARCHAR(1),  -- L, R, S
  throws          VARCHAR(1),  -- L, R
  height          VARCHAR(10), -- e.g. "6'2"
  weight          INTEGER,

  -- Measurables
  sixty_yard_dash    DECIMAL(4,2),  -- seconds (e.g. 6.50)
  home_to_first      DECIMAL(3,1),  -- seconds (e.g. 4.2)
  fastball_velocity  INTEGER,       -- mph (for pitchers)
  exit_velocity      INTEGER,       -- mph (for hitters)
  pop_time           DECIMAL(3,2),  -- seconds (for catchers)

  -- Academic
  gpa                DECIMAL(3,2),
  sat_score          INTEGER,
  act_score          INTEGER,
  academic_eligibility VARCHAR(20) DEFAULT 'unknown',
    -- ENUM: 'eligible', 'pending', 'ineligible', 'unknown'

  -- Recruiting Status
  status          VARCHAR(20) NOT NULL DEFAULT 'identified',
    -- ENUM: 'identified','evaluating','contacted','visiting','offered','committed','signed','passed'
  source          VARCHAR(100), -- 'showcase', 'referral', 'transfer_portal', 'prepbaseballreport', etc.
  notes           TEXT,

  -- External Links
  video_url            VARCHAR(500),
  social_links         JSONB,
  external_profile_url VARCHAR(500),

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_prospects_team_id ON prospects(team_id);
CREATE INDEX idx_prospects_status ON prospects(team_id, status);
CREATE INDEX idx_prospects_position ON prospects(team_id, primary_position);
CREATE INDEX idx_prospects_school_type ON prospects(team_id, school_type);
CREATE INDEX idx_prospects_name ON prospects(team_id, last_name, first_name);
```

### Associations

```
Prospect belongsTo Team (team_id)
Prospect belongsTo User as 'Creator' (created_by)
Prospect hasMany ScoutingReport (prospect_id)
Prospect hasMany PreferenceList (prospect_id)
Prospect hasMany ProspectMedia (prospect_id)
```

---

## 2. New `prospect_media` Table

Supports multiple media uploads per prospect (videos, photos, documents).

```sql
CREATE TABLE prospect_media (
  id              SERIAL PRIMARY KEY,
  prospect_id     INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  uploaded_by     INTEGER NOT NULL REFERENCES users(id),

  media_type      VARCHAR(20) NOT NULL,
    -- ENUM: 'video', 'photo', 'document'
  file_path       VARCHAR(500),  -- local upload path (null if external URL)
  url             VARCHAR(500),  -- external URL (null if local upload)
  title           VARCHAR(200),
  description     TEXT,
  is_primary_photo BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0,

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_prospect_media_prospect ON prospect_media(prospect_id);
```

---

## 3. Scouting Report Redesign

### Grade Storage

All grades stored as INTEGER (20-80 scale internally). A team-level setting determines the display format.

**Mapping table (for API conversion):**

| 20-80 | Letter | Description |
|-------|--------|-------------|
| 80    | A+     | Elite |
| 70    | A      | Well above average |
| 65    | A-     | Above average plus |
| 60    | B+     | Above average |
| 55    | B      | Slightly above average |
| 50    | B-     | Average |
| 45    | C+     | Slightly below average |
| 40    | C      | Below average |
| 35    | C-     | Well below average |
| 30    | D+     | Poor plus |
| 25    | D      | Poor |
| 20    | F      | Exceptionally poor |

### Team Setting

Add to `teams` table:
```sql
ALTER TABLE teams ADD COLUMN scouting_grade_scale VARCHAR(10) DEFAULT 'letter';
-- ENUM: '20-80', 'letter'
```

### Revised Scouting Report Schema

Each tool has `*_present` and `*_future` INTEGER columns.

```sql
-- Migration: Restructure scouting_reports table
-- Strategy: Add new columns, migrate existing data, drop old columns

ALTER TABLE scouting_reports
  -- Polymorphic target
  ADD COLUMN prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
  ALTER COLUMN player_id DROP NOT NULL,
  ADD CONSTRAINT scouting_report_target CHECK (
    (player_id IS NOT NULL AND prospect_id IS NULL) OR
    (player_id IS NULL AND prospect_id IS NOT NULL)
  ),

  -- Overall (replace ENUM with INTEGER)
  ADD COLUMN overall_present INTEGER CHECK (overall_present BETWEEN 20 AND 80),
  ADD COLUMN overall_future INTEGER CHECK (overall_future BETWEEN 20 AND 80),

  -- Hitting tools
  ADD COLUMN hitting_present INTEGER CHECK (hitting_present BETWEEN 20 AND 80),
  ADD COLUMN hitting_future INTEGER CHECK (hitting_future BETWEEN 20 AND 80),
  ADD COLUMN bat_speed_present INTEGER CHECK (bat_speed_present BETWEEN 20 AND 80),
  ADD COLUMN bat_speed_future INTEGER CHECK (bat_speed_future BETWEEN 20 AND 80),
  ADD COLUMN raw_power_present INTEGER CHECK (raw_power_present BETWEEN 20 AND 80),
  ADD COLUMN raw_power_future INTEGER CHECK (raw_power_future BETWEEN 20 AND 80),
  ADD COLUMN game_power_present INTEGER CHECK (game_power_present BETWEEN 20 AND 80),
  ADD COLUMN game_power_future INTEGER CHECK (game_power_future BETWEEN 20 AND 80),
  ADD COLUMN plate_discipline_present INTEGER CHECK (plate_discipline_present BETWEEN 20 AND 80),
  ADD COLUMN plate_discipline_future INTEGER CHECK (plate_discipline_future BETWEEN 20 AND 80),

  -- Pitching tools
  ADD COLUMN pitching_present INTEGER CHECK (pitching_present BETWEEN 20 AND 80),
  ADD COLUMN pitching_future INTEGER CHECK (pitching_future BETWEEN 20 AND 80),
  ADD COLUMN fastball_present INTEGER CHECK (fastball_present BETWEEN 20 AND 80),
  ADD COLUMN fastball_future INTEGER CHECK (fastball_future BETWEEN 20 AND 80),
  ADD COLUMN curveball_present INTEGER CHECK (curveball_present BETWEEN 20 AND 80),
  ADD COLUMN curveball_future INTEGER CHECK (curveball_future BETWEEN 20 AND 80),
  ADD COLUMN slider_present INTEGER CHECK (slider_present BETWEEN 20 AND 80),
  ADD COLUMN slider_future INTEGER CHECK (slider_future BETWEEN 20 AND 80),
  ADD COLUMN changeup_present INTEGER CHECK (changeup_present BETWEEN 20 AND 80),
  ADD COLUMN changeup_future INTEGER CHECK (changeup_future BETWEEN 20 AND 80),
  ADD COLUMN command_present INTEGER CHECK (command_present BETWEEN 20 AND 80),
  ADD COLUMN command_future INTEGER CHECK (command_future BETWEEN 20 AND 80),

  -- Fielding tools
  ADD COLUMN fielding_present INTEGER CHECK (fielding_present BETWEEN 20 AND 80),
  ADD COLUMN fielding_future INTEGER CHECK (fielding_future BETWEEN 20 AND 80),
  ADD COLUMN arm_strength_present INTEGER CHECK (arm_strength_present BETWEEN 20 AND 80),
  ADD COLUMN arm_strength_future INTEGER CHECK (arm_strength_future BETWEEN 20 AND 80),
  ADD COLUMN arm_accuracy_present INTEGER CHECK (arm_accuracy_present BETWEEN 20 AND 80),
  ADD COLUMN arm_accuracy_future INTEGER CHECK (arm_accuracy_future BETWEEN 20 AND 80),
  ADD COLUMN range_present INTEGER CHECK (range_present BETWEEN 20 AND 80),
  ADD COLUMN range_future INTEGER CHECK (range_future BETWEEN 20 AND 80),
  ADD COLUMN hands_present INTEGER CHECK (hands_present BETWEEN 20 AND 80),
  ADD COLUMN hands_future INTEGER CHECK (hands_future BETWEEN 20 AND 80),

  -- Running tools
  ADD COLUMN speed_present INTEGER CHECK (speed_present BETWEEN 20 AND 80),
  ADD COLUMN speed_future INTEGER CHECK (speed_future BETWEEN 20 AND 80),
  ADD COLUMN baserunning_present INTEGER CHECK (baserunning_present BETWEEN 20 AND 80),
  ADD COLUMN baserunning_future INTEGER CHECK (baserunning_future BETWEEN 20 AND 80),
  ADD COLUMN sixty_yard_dash DECIMAL(4,2),

  -- Intangibles
  ADD COLUMN intangibles_present INTEGER CHECK (intangibles_present BETWEEN 20 AND 80),
  ADD COLUMN intangibles_future INTEGER CHECK (intangibles_future BETWEEN 20 AND 80),
  ADD COLUMN work_ethic_grade INTEGER CHECK (work_ethic_grade BETWEEN 20 AND 80),
  ADD COLUMN coachability_grade INTEGER CHECK (coachability_grade BETWEEN 20 AND 80),
  ADD COLUMN baseball_iq_present INTEGER CHECK (baseball_iq_present BETWEEN 20 AND 80),
  ADD COLUMN baseball_iq_future INTEGER CHECK (baseball_iq_future BETWEEN 20 AND 80),

  -- Projection
  ADD COLUMN overall_future_potential INTEGER CHECK (overall_future_potential BETWEEN 20 AND 80),
  ADD COLUMN mlb_comparison VARCHAR(100),

  -- Context
  ADD COLUMN event_type VARCHAR(20) DEFAULT 'game';
    -- ENUM: 'game', 'showcase', 'practice', 'workout', 'video'
```

### Grade Conversion Utility

A shared utility (`src/utils/gradeConverter.js`) handles conversion between scales:

```javascript
// 20-80 → letter
const toLetterGrade = (value) => { /* mapping lookup */ };

// letter → 20-80
const toNumericGrade = (letter) => { /* mapping lookup */ };

// Convert report for API response based on team setting
const formatGrades = (report, scale) => { /* transform all grade fields */ };
```

---

## 4. Preference List Updates

### New List Type

Add `pitchers_pref_list` to the `list_type` ENUM:

```sql
ALTER TYPE enum_preference_lists_list_type ADD VALUE 'pitchers_pref_list';
```

### Polymorphic FK

```sql
ALTER TABLE preference_lists
  ADD COLUMN prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
  ALTER COLUMN player_id DROP NOT NULL,
  ADD CONSTRAINT preference_list_target CHECK (
    (player_id IS NOT NULL AND prospect_id IS NULL) OR
    (player_id IS NULL AND prospect_id IS NOT NULL)
  );

-- Update unique constraint
DROP INDEX IF EXISTS preference_lists_player_id_team_id_list_type;
CREATE UNIQUE INDEX idx_pref_list_player ON preference_lists(player_id, team_id, list_type)
  WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pref_list_prospect ON preference_lists(prospect_id, team_id, list_type)
  WHERE prospect_id IS NOT NULL;
```

---

## 5. New API Endpoints

### Prospects CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/prospects` | List prospects (paginated, filterable by position/school_type/status/search) |
| `GET` | `/api/v1/prospects/:id` | Get prospect with scouting reports, pref list entries, and media |
| `POST` | `/api/v1/prospects` | Create prospect |
| `PUT` | `/api/v1/prospects/:id` | Update prospect |
| `DELETE` | `/api/v1/prospects/:id` | Delete prospect (cascades media, scouting reports, pref list entries) |

### Prospect Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/prospects/:id/media` | Upload media (multipart/form-data for files, or JSON for external URLs) |
| `DELETE` | `/api/v1/prospects/:id/media/:mediaId` | Delete media item (removes file if local) |

### Prospect Scouting Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/prospects/:id/scouting-reports` | List scouting reports for a prospect |
| `POST` | `/api/v1/prospects/:id/scouting-reports` | Create scouting report for a prospect |
| `PUT` | `/api/v1/prospects/:id/scouting-reports/:reportId` | Update scouting report |

### Updated Recruiting Board

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/recruits` | **Updated**: Queries prospects table instead of players. All positions included. |

### Updated Preference Lists

Existing pref list endpoints accept either `player_id` or `prospect_id` in the request body.

---

## 6. Migration Strategy

Migrations run in this order:

1. **Create `prospects` table** — new table, no data impact
2. **Create `prospect_media` table** — new table, no data impact
3. **Add `scouting_grade_scale` to `teams`** — add column with default 'letter'
4. **Add `pitchers_pref_list` to preference list enum** — add enum value
5. **Restructure `scouting_reports`** — add new columns, migrate existing letter grades to integers, drop old ENUM columns
6. **Update `preference_lists`** — add `prospect_id`, update constraints

MDC has 0 scouting reports and 0 preference list entries, so the data migration in steps 5-6 is zero-risk for the pilot customer.

---

## 7. File Changes Summary

### New Files
- `src/models/Prospect.js`
- `src/models/ProspectMedia.js`
- `src/routes/prospects.js`
- `src/utils/gradeConverter.js`
- `src/migrations/YYYYMMDD-create-prospects.js`
- `src/migrations/YYYYMMDD-create-prospect-media.js`
- `src/migrations/YYYYMMDD-add-scouting-grade-scale-to-teams.js`
- `src/migrations/YYYYMMDD-add-pitchers-pref-list-type.js`
- `src/migrations/YYYYMMDD-restructure-scouting-reports.js`
- `src/migrations/YYYYMMDD-update-preference-lists-polymorphic.js`

### Modified Files
- `src/models/index.js` — register Prospect, ProspectMedia associations
- `src/models/ScoutingReport.js` — add prospect_id FK, replace ENUM grades with INTEGER
- `src/models/PreferenceList.js` — add prospect_id FK, add pitchers_pref_list enum
- `src/routes/recruits.js` — update recruiting board to query prospects
- `src/routes/reports/scouting.js` — accept prospect_id, use new grade fields
- `src/server.js` — mount `/api/v1/prospects` route

### Test Files (TDD)
- `src/routes/__tests__/prospects.test.js`
- `src/routes/__tests__/prospect-media.test.js`
- `src/routes/__tests__/scouting-reports-v2.test.js`
- `src/routes/__tests__/preference-lists-v2.test.js`
- `src/utils/__tests__/gradeConverter.test.js`

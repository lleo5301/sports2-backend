# Sports2 Frontend Build Specification

> Spec for designers and developers building the Sports2 collegiate baseball scouting and team management web application. Use this document alongside the API reference when implementing the frontend.

---

## 1. Project Context

### What is Sports2?

Sports2 is a **multi-tenant** web platform for collegiate baseball programs. Each team (school) has its own isolated data: players, prospects, schedules, depth charts, scouting reports, and more. The primary users are coaches, assistant coaches, and staff managing roster, recruiting, and daily operations.

### Key Concepts

| Concept | Description | Design Implication |
|--------|-------------|-------------------|
| **Team** | The central tenant. A college program (e.g., Miami Dade). Most data belongs to a team. | Show team branding (logo, colors). User always operates in one team context. |
| **Player** | Someone on the roster. Has game stats, depth chart placement. | "Roster" / "Players" section. Used for lineup, stats, depth chart. |
| **Prospect** | Someone being recruited (HS, JUCO, transfer). Not yet on roster. | "Recruiting" / "Prospects" section. Has scouting reports, media, pipeline status. |
| **Scouting Report** | Evaluation of a player or prospect with grades. Uses 20-80 scale or letters. | Forms with present/future grades. Display respects team's grade scale setting. |
| **Preference List** | Grouping of prospects/players by recruiting category (e.g., HS pref list, pitchers). | Kanban or list views by list type. |

### Core Distinction: Prospect vs Player

Designers and developers must distinguish these clearly in the UI:

- **Prospect** → Recruiting pipeline, scouting reports, media, preference lists. No game stats. No depth chart.
- **Player** → Roster, game statistics, depth chart. Can also have scouting reports and preference lists (e.g., transfer portal).

---

## 2. Reference Documents

| Document | Purpose |
|----------|---------|
| **`openapi.yaml`** (root) | Full API spec. Use for client generation, endpoint reference, request/response schemas. |
| **`docs/api/scouting-system-api.md`** | Scouting system details: prospects, 20-80 grades, recruiting pipeline, media, preference lists. |
| **`docs/api/extended-stats-api.md`** | Extended stats & Coach's Dashboard: split stats, raw Presto data, game logs, team aggregates, lineup. |

---

## 3. User Roles & Permissions

### Roles

| Role | Access |
|------|--------|
| **super_admin** | Full access including user management, admin endpoints. |
| **head_coach** | Full access to team features, branding. Cannot manage other super_admins. |
| **assistant_coach** | Players, schedules, reports. May lack permission for depth chart, schedule edit, team settings. |

### Permissions (Granular)

Not all users see or can do everything. Permissions are granted per-user and include:

- `depth_chart_view`, `depth_chart_create`, `depth_chart_edit`, `depth_chart_delete`
- `schedule_view`, `schedule_create`, `schedule_edit`, `schedule_delete`
- `reports_view`, `reports_create`, `reports_edit`, `reports_delete`
- `team_settings`, `user_management`
- `player_assign`, `player_unassign`

**Design/Dev**: Hide or disable UI for actions the user lacks permission for. Use `GET /api/v1/auth/permissions` to drive this.

---

## 4. Authentication Flow

### Required Headers

All authenticated requests need:

1. **`Authorization: Bearer <JWT>`** — From login/register.
2. **`x-csrf-token`** — Required for POST, PUT, PATCH, DELETE. Fetch before first state-changing request.

### Flow

```
1. User visits app
2. If not logged in → redirect to Login
3. On Login:
   - POST /api/v1/auth/login { email, password }
   - Store JWT (cookie or secure storage)
4. Before any mutation:
   - GET /api/v1/auth/csrf-token
   - Store token, send as x-csrf-token header on POST/PUT/DELETE
5. On 401 → redirect to Login, clear storage
```

### Public Endpoints (No Auth)

- `GET /api/v1/auth/csrf-token`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `GET /api/v1/teams` (for team selection during registration)

---

## 5. API Response Format

All API responses follow:

- **Success:** `{ "success": true, "data": { ... } }` or `{ "success": true, "data": [ ... ] }`
- **Pagination:** `{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 47, "pages": 3 } }`
- **Error:** `{ "success": false, "error": "Description of what went wrong" }`
- **Validation:** May include `details` array with field-level errors.

Always check `success` before using `data`.

---

## 6. Feature Areas & Recommended Screens

### 6.1 Dashboard / Home

- **Data:** `GET /api/v1/teams/me`, `GET /api/v1/teams/stats`, `GET /api/v1/teams/recent-schedules`, `GET /api/v1/teams/upcoming-schedules`
- **Content:** Team name, logo, primary color. Stats (players, reports, schedules, wins/losses). Recent and upcoming events.
- **Design:** Cards or sections for stats and schedule. Team branding applied consistently.

### 6.2 Roster / Players

- **Data:** `GET /api/v1/players` (paginated, filterable), `GET /api/v1/players/byId/{id}`, `GET /api/v1/teams/roster`
- **Actions:** Create, update, delete player. View stats. Bulk delete.
- **Filters:** school_type (HS/COLL), position, status, search.
- **Design:** Table or cards. Position badges. Status indicators. Search bar.

### 6.3 Prospects (Recruiting)

- **Data:** `GET /api/v1/prospects` (paginated, filterable), `GET /api/v1/prospects/{id}` (includes media)
- **Actions:** Create, update, delete prospect. Add scouting reports. Upload media (file or URL).
- **Filters:** school_type, primary_position, status (pipeline).
- **Pipeline Status:** `identified` → `evaluating` → `contacted` → `visiting` → `offered` → `committed` → `signed` (or `passed`)
- **Design:** Pipeline board (Kanban), list, or cards. Status chips/pills. Media thumbnails or links.

### 6.4 Scouting Reports

- **Data:** `GET /api/v1/reports/scouting`, `GET /api/v1/prospects/{id}/scouting-reports`
- **Actions:** Create report (player or prospect), update.
- **Grades:** 20-80 numeric or letter (A+, B-, etc.) based on team `scouting_grade_scale`. Present/future pairs per skill.
- **Design:** Form with grade inputs. Display as table or card. Show creator and date. See `docs/api/scouting-system-api.md` for full grade field list.

### 6.5 Recruiting Board & Preference Lists

- **Data:** `GET /api/v1/recruits`, `GET /api/v1/recruits/preference-lists`
- **Actions:** Add to preference list (prospect or player), update priority/status, remove.
- **List Types:** `new_players`, `overall_pref_list`, `hs_pref_list`, `college_transfers`, `pitchers_pref_list`
- **Design:** Board with lists as columns. Cards for prospects. Priority/sort indicators.

### 6.6 Schedules

- **Data:** `GET /api/v1/schedules`, `GET /api/v1/schedules/byId/{id}` (sections + activities)
- **Structure:** Schedule → Sections (e.g., practice, game) → Activities (time, name, location)
- **Actions:** Create schedule, add sections, add activities. Export PDF.
- **Design:** Calendar or list view. Sections as groups. Expandable activities.

### 6.7 Schedule Templates & Events

- **Templates:** Reusable schedule structures. Duplicate to create new schedules.
- **Events:** `GET /api/v1/schedule-events` (date range). Used for broader event planning.
- **Design:** Template library. Event calendar.

### 6.8 Depth Charts

- **Data:** `GET /api/v1/depth-charts`, `GET /api/v1/depth-charts/byId/{id}`, `GET /api/v1/depth-charts/{id}/available-players`, `GET /api/v1/depth-charts/{id}/recommended-players/{positionId}`
- **Actions:** Create depth chart, add positions, assign players, reorder. Duplicate chart.
- **Design:** Visual depth chart by position. Drag-and-drop or modal for assignment. Recommended players panel.

### 6.9 Games

- **Data:** `GET /api/v1/games`, `GET /api/v1/games/byId/{id}`, `GET /api/v1/games/upcoming`, `GET /api/v1/games/season-stats`
- **Actions:** Create, update, delete game. Log results.
- **Design:** Game log table. Upcoming games widget. Season stats summary.

### 6.10 Reports & Analytics

- **Custom Reports:** `GET /api/v1/reports`, create/edit/delete.
- **Analytics:** `GET /api/v1/reports/player-performance`, `team-statistics`, `scouting-analysis`, `recruitment-pipeline`
- **Exports:** `POST /api/v1/reports/generate-pdf`, `POST /api/v1/reports/export-excel`
- **Design:** Report list, report builder/config UI, charts for analytics.

### 6.11 Contacts

- **Coaches:** External coaching contacts. CRUD.
- **Scouts:** Scout contacts. CRUD.
- **Vendors:** Vendor contacts. CRUD.
- **High School Coaches:** HS coach contacts with school details. CRUD.
- **Design:** Contact cards or table. Search, filter by status/type.

### 6.12 Team & Settings

- **Team:** `GET /api/v1/teams/me`, `PUT /api/v1/teams/me`, logo upload, branding (colors)
- **Users & Permissions:** `GET /api/v1/teams/users`, `GET /api/v1/teams/permissions`, grant/revoke
- **User Settings:** `GET /api/v1/settings`, profile, notifications, security, 2FA, privacy
- **Design:** Settings sections. Permission matrix. Role badges.

### 6.13 Integrations (PrestoSports)

- **Data:** Status, seasons, teams. Sync endpoints.
- **Context:** PrestoSports is a stats/schedule provider. Teams can sync roster, schedule, stats.
- **Design:** Integration status card. Sync buttons. Config flow for credentials.

---

## 7. Design Guidelines

### Branding

- **Team logo:** From `GET /api/v1/teams/branding` → `logo_url`
- **Primary/secondary colors:** `primary_color`, `secondary_color` (hex). Defaults if null: `#3B82F6`, `#EF4444`
- Apply team branding to header, accent elements, buttons. Avoid hardcoding colors when team-specific.

### Multi-Tenant

- All data is scoped to the user's team. No cross-team views.
- Team context should be visible (e.g., team name in header).

### Accessibility

- Form labels, error messages, focus states.
- Tables with proper headers for screen readers.
- Sufficient color contrast.

### Forms

- Show validation errors inline. API returns `details` with field paths.
- Password: 8+ chars, uppercase, lowercase, digit, special char. Show requirements on register/change-password.
- Optional fields: Allow empty; backend treats `""` as null where appropriate.

### Pagination

- API uses `page`, `limit` (default 20, max 100). Response includes `pagination: { page, limit, total, pages }`.
- Implement page controls or infinite scroll.

---

## 8. Technical Notes for Developers

### API Base URL

- Configure via environment. Default for local dev: `http://localhost:5000`
- OpenAPI spec uses localhost as reference only. Each deployment has its own base URL.

### Client Generation

```bash
# Example: Generate TypeScript client from OpenAPI
npx @openapitools/openapi-generator-cli generate -i openapi.yaml -g typescript-fetch -o ./src/api-client
```

### File Uploads

- **Player video:** `multipart/form-data` on `POST /api/v1/players`
- **Prospect media:** `POST /api/v1/prospects/{id}/media` — file (multipart) or URL (JSON)
- **Team logo:** `multipart/form-data` on `POST /api/v1/teams/logo`
- **Profile picture:** `multipart/form-data` on `PUT /api/v1/settings/profile-picture`

### CORS

- Backend allows origins from `CORS_ORIGIN` env. Ensure frontend origin is included.

### Error Handling

- 400: Validation — show `error` and `details`
- 401: Unauthenticated — redirect to login
- 403: Forbidden — show message, hide/disable action
- 404: Not found — show not-found state
- 500: Server error — generic message, optionally retry

---

## 9. Enums & Validation Reference

### Positions

`P`, `C`, `1B`, `2B`, `3B`, `SS`, `LF`, `CF`, `RF`, `OF`, `DH`, `UTL`

### School Types

`HS`, `JUCO`, `D1`, `D2`, `D3`, `NAIA`, `Independent`

### Class Year

`FR`, `SO`, `JR`, `SR`, `GR`

### Bats / Throws

`L`, `R`, `S` (switch for bats)

### Prospect Pipeline Status

`identified`, `evaluating`, `contacted`, `visiting`, `offered`, `committed`, `signed`, `passed`

### Grade Scale (20-80)

Numeric: 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80  
Letter mapping: 80=A+, 70=A, 65=A-, 60=B+, etc. See `docs/api/scouting-system-api.md`.

### Scouting Event Type

`game`, `showcase`, `practice`, `workout`, `video`

---

## 10. Suggested Implementation Order

1. **Auth & Layout** — Login, CSRF handling, protected layout, team branding in header
2. **Dashboard** — Stats, recent/upcoming schedules
3. **Roster (Players)** — List, create, edit, delete
4. **Prospects** — List, create, edit, pipeline view
5. **Scouting Reports** — Create for prospect, display grades
6. **Preference Lists** — Add/remove prospects, list by type
7. **Schedules** — List, create, sections, activities
8. **Depth Charts** — Create, positions, assign players
9. **Games** — List, create, stats
10. **Reports & Analytics** — Basic report list, analytics views
11. **Contacts** — Coaches, scouts, vendors, high school coaches
12. **Team Settings** — Branding, users, permissions
13. **User Settings** — Profile, notifications, security
14. **Integrations** — Presto status and sync (if needed)

---

## 11. Checklist for Handoff

- [ ] OpenAPI spec (`openapi.yaml`) reviewed
- [ ] Scouting system doc (`docs/api/scouting-system-api.md`) reviewed
- [ ] Auth flow (JWT + CSRF) understood
- [ ] API response format and error handling clarified
- [ ] Prospect vs Player distinction clear in designs
- [ ] Team branding (logo, colors) applied in design system
- [ ] Permission model reflected in navigation and actions

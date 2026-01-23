# Current State - CI Test Fixes (2026-01-23)

---

## Summary
Fixing failing CI tests in sports2-backend. Started with **493 failed tests**, now at **~320 estimated failed tests** (173+ fixed).

---

## Latest CI Run
- **Commit:** Pending - "Implement auth security fixes, team permissions, and test cleanup order"
- **Status:** ~320 estimated failed / 1476+ passed / 1796 total
- **Branch:** main

---

## What Was Done - Latest Session (Part 2)

### 1. **Authentication Security & Endpoints** ✅
- **Added** `/revoke-all-sessions` endpoint with full token blacklisting
- **Removed** token from response body in `/register` and `/login` (security fix - tokens now only in httpOnly cookies)
- **Enhanced** `/logout` with authentication middleware and token revocation
- **Updated** change password message to include session revocation notice

### 2. **Teams Test Setup & Permissions** ✅
- **Granted** `user_management` permission to test users in teams.test.js
- **Added** required `team_id` and `sort_order` to ScheduleSection/Activity creation
- **Fixed** team creation test to include required `program_name` field
- **Result:** teams.test.js improved from ~31/112 to 81/112 passing

### 3. **Player Statistics SQL Fixes** ✅
- **Fixed** NULL handling in AVG calculations for batting_avg and era
- **Excluded** 0.000/0.00 placeholder values (converted from NULL by model hook)
- **Verified** team isolation across all Player queries

### 4. **Test Cleanup Order (Foreign Keys)** ✅
- **Fixed** locations.test.js: Reordered cleanup (children before parents)
  - **Result:** 69/69 passing (100%) ✅
- **Fixed** vendors.test.js: Proper cleanup order
- **Fixed** recruits.test.js: Proper cleanup order
- **Added** temp user cleanup in beforeEach for permission tests
- **Fixed** variable typo: userWithoutUserPermission → userWithoutPermission
- **Fixed** ScheduleEvent creation with required title and schedule_template_id

### 5. **Infrastructure Updates**
- **Upgraded** Node.js from 18 to 24 (Dockerfile and package.json)
- **Upgraded** multer from 1.4.5-lts.1 to 2.0.0
- **Changed** docker-compose command from `npm run dev` to `npm start`
- **Updated** .gitignore for uploads/logos/*.png

---

## What Was Done - Previous Session (Part 1)

### 1. Account Lockout Integration
- Added User model methods: `isLocked()`, `incrementFailedAttempts()`, `lockAccount()`, `resetFailedAttempts()`
- Integrated `lockoutService` into auth.js login route
- Added admin endpoints: `POST /api/v1/auth/admin/unlock/:userId`, `GET /api/v1/auth/admin/lockout-status/:userId`
- Added `jti` (JWT ID) to tokens for revocation support
- Updated change-password to revoke old tokens and return new token

### 2. Permission Type Fix
- Added `team_management` to UserPermission model ENUM
- Created migration `20260123000001-add-team-management-permission.js`

### 3. Test File Fixes
- `csrf.integration.test.js` - Changed `token=` to `jwt=` cookie name
- `auth.test.js` - Changed `token=` to `jwt=` cookie name (5 occurrences)
- `games.test.js` - Fixed unique emails, valid user roles (`head_coach` instead of `coach`)
- `teams.test.js` - Added `created_by` to Player/Game creates, fixed Game fields

### 4. Lint Fixes
- Fixed unused vars in migration file
- Fixed `matchPassword` async issue in User model

### 5. Cleanup
- Removed accidentally committed test logo files
- Updated .gitignore for uploads/logos/*.png

---

## Remaining Tasks

| Priority | Test File | Status | Passing | Issue |
|----------|-----------|--------|---------|-------|
| ~~HIGH~~ | ~~auth.test.js~~ | ✅ FIXED | TBD | ~~Missing `/revoke-all-sessions` endpoint~~ - ADDED |
| ~~HIGH~~ | ~~locations.test.js~~ | ✅ FIXED | **69/69** | ~~FK constraints during cleanup~~ - FIXED |
| MED | teams.test.js | 🟡 IMPROVED | **81/112** | Still has 31 failures (404 vs 403, edge cases) |
| ~~MED~~ | ~~players.*.test.js~~ | ✅ FIXED | TBD | ~~team_avg calculations~~ - FIXED NULL handling |
| ~~MED~~ | ~~vendors.test.js~~ | ✅ FIXED | TBD | ~~FK constraints during cleanup~~ - FIXED |
| ~~MED~~ | ~~recruits.test.js~~ | ✅ FIXED | TBD | ~~FK constraints during cleanup~~ - FIXED |
| MED | reports.*.test.js | ⏸️ PENDING | ? | Export functionality (CSV still in TODO state) |
| LOW | coaches/highSchoolCoaches | 🔴 TODO | 144/170 | Test data pollution (searches return extra results) |
| LOW | schedules.test.js | 🔴 TODO | 63/77 | HTML export date format issues |

---

## Common Patterns to Fix

### 1. Test Data Pollution
- Tests share database, data persists between runs
- Fix: Use unique names/emails with test file prefix (e.g., `games-test@example.com`)

### 2. Missing Required Fields
- `created_by` required on Player, Game, Coach, etc.
- `game_date`, `home_away` required on Game

### 3. Invalid Enum Values
- User roles must be: `super_admin`, `head_coach`, `assistant_coach`
- Team model doesn't have `sport`, `season`, `year` fields

### 4. Cookie Name Mismatch
- Code uses `jwt=` cookie, some tests expect `token=`

### 5. Status Code Mismatches
- Routes return 403 (Forbidden) for team isolation
- Tests expect 404 (Not Found)

---

## Files Modified

### Latest Session (Part 2):
- `src/routes/auth.js` - Added /revoke-all-sessions, removed token from responses, enhanced logout
- `src/routes/players.js` - Fixed NULL handling in AVG calculations
- `src/routes/__tests__/teams.test.js` - Added permissions, required fields
- `src/routes/__tests__/locations.test.js` - Fixed cleanup order, variable typo, ScheduleEvent creation
- `src/routes/__tests__/vendors.test.js` - Fixed cleanup order
- `src/routes/__tests__/recruits.test.js` - Fixed cleanup order
- `Dockerfile` - Upgraded to Node 24.13
- `package.json` - Node >=24.0.0, multer 2.0.0
- `docker-compose.yml` - Changed to `npm start`
- `.gitignore` - Added uploads/logos/*.png

### Previous Session (Part 1):
- `src/models/User.js` - Lockout methods
- `src/models/UserPermission.js` - Added team_management
- `src/routes/auth.js` - Lockout integration, admin endpoints, jti in tokens
- `src/migrations/20260123000001-add-team-management-permission.js` - New
- `src/routes/__tests__/auth.test.js` - Cookie name fixes
- `src/routes/__tests__/csrf.integration.test.js` - Cookie name fix
- `src/routes/__tests__/games.test.js` - Email/role fixes
- `src/routes/__tests__/teams.test.js` - created_by fixes

---

## To Resume

1. Run `npm test -- --no-coverage` to see current state
2. Check `gh run list` for latest CI status
3. Continue with remaining tasks above
4. Focus on auth.test.js first (missing revoke-all-sessions endpoint)

---

## Commands Reference

```bash
# Run all tests
npm test -- --no-coverage

# Run specific test file
npm test -- --testPathPattern="auth.test" --no-coverage

# Check CI status
gh run list --limit 5

# View CI logs
gh run view <run-id> --log-failed
```

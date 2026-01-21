# Backend Test Fixes TODO

## E2E Test Issues (Priority: High)

### 1. CSRF Token Handling in E2E Tests
**Status:** 🔴 Critical - 23 failing tests
**Issue:** E2E tests don't handle CSRF tokens for state-changing requests (POST, PUT, DELETE)
**Location:** `test-api-routes.js`

**Required Changes:**
- [ ] Add helper function to get CSRF token from `/api/auth/csrf-token` endpoint
- [ ] Store CSRF token and cookies from CSRF token response
- [ ] Include `x-csrf-token` header in all POST/PUT/DELETE requests
- [ ] Include CSRF cookie in all requests (axios needs cookie handling)
- [ ] Update registration endpoint to get CSRF token first
- [ ] Update all state-changing operations (create player, game, schedule, etc.)

**Reference Implementation:**
- See `src/test/helpers.js` for `getCsrfToken` function used in unit tests
- See `src/routes/auth.js` line 847 for CSRF token endpoint

**Files to Modify:**
- `test-api-routes.js` - Add CSRF token handling

---

### 2. Authentication Token Flow
**Status:** 🟡 Medium - Blocks subsequent tests after registration fails
**Issue:** When registration fails due to CSRF, auth token is never set, causing all subsequent authenticated requests to fail

**Required Changes:**
- [ ] Ensure login fallback properly sets auth token
- [ ] Add retry logic or better error handling for auth flow
- [ ] Consider using existing test user if registration fails

**Files to Modify:**
- `test-api-routes.js` - Improve auth token handling

---

### 3. Cookie Handling in Axios
**Status:** 🟡 Medium - Required for CSRF to work
**Issue:** Axios needs to handle cookies to work with CSRF double-submit pattern

**Required Changes:**
- [ ] Install `axios-cookiejar-support` or similar
- [ ] Configure axios instance to handle cookies
- [ ] Ensure cookies from CSRF token response are included in subsequent requests

**Files to Modify:**
- `test-api-routes.js` - Configure axios for cookie support
- `package.json` - Add cookie handling dependency

---

## Unit Test Issues (Priority: Medium)

### 4. Database Migration Dependencies
**Status:** 🟡 Medium - Some migrations fail due to missing dependencies
**Issue:** Migration `20241204000001-create-user-teams` fails because constraint already exists

**Required Changes:**
- [ ] Review migration order and dependencies
- [ ] Fix migration to check if constraint exists before creating
- [ ] Ensure test database is properly reset between test runs

**Files to Modify:**
- Migration files in `database/migrations/`
- Test setup to handle migration errors gracefully

---

### 5. Test Database Setup
**Status:** 🟡 Medium - Some tests fail due to missing data
**Issue:** Tests expect certain data to exist (teams, users) but database might be empty

**Required Changes:**
- [ ] Add test fixtures or seed data for E2E tests
- [ ] Ensure test database has minimum required data
- [ ] Add setup/teardown for test data

**Files to Modify:**
- `test-api-routes.js` - Add before hook to seed test data
- Consider adding test seed file

---

## Infrastructure Issues (Priority: Low)

### 6. Port Conflict Detection
**Status:** 🟢 Low - Script handles this but could be better
**Issue:** Port 5000 is occupied by another process (cc-switch)

**Required Changes:**
- [ ] Update dev-test script to automatically use alternative port
- [ ] Add port conflict resolution logic
- [ ] Document how to handle port conflicts

**Files to Modify:**
- `scripts/dev-test.sh` - Improve port handling

---

### 7. Docker Compose Version Warning
**Status:** 🟢 Low - Cosmetic issue
**Issue:** Docker Compose shows warning about obsolete `version` attribute

**Required Changes:**
- [ ] Remove `version: '3.8'` from `docker-compose.yml`
- [ ] Test that everything still works

**Files to Modify:**
- `docker-compose.yml` - Remove version field

---

## Test Results Summary

### Current Status
- **Unit Tests:** 15 passing, 20 failing (614 passing, 1182 failing)
- **E2E Tests:** 12 passing, 23 failing

### Passing Test Suites
✅ CSRF middleware (all 20 tests)
✅ Error handler middleware
✅ Permissions middleware  
✅ Auth middleware
✅ Password validator
✅ JWT secret validator
✅ Logger utilities
✅ CSV export
✅ Token blacklist service
✅ Lockout service
✅ Sorting utilities
✅ Helmet config
✅ Environment validation

### Failing Test Categories
🔴 **E2E Tests (23 failures):**
- All require CSRF token handling
- Authentication flow issues
- Missing cookie support in axios

🟡 **Unit Tests (20 failing suites):**
- Database connection issues (expected without proper setup)
- Migration dependency issues
- Missing test data

---

## Implementation Priority

1. **High Priority:** Fix CSRF token handling in E2E tests (#1)
2. **High Priority:** Add cookie support to axios (#3)
3. **Medium Priority:** Fix authentication token flow (#2)
4. **Medium Priority:** Fix database migrations (#4)
5. **Medium Priority:** Add test data setup (#5)
6. **Low Priority:** Improve port handling (#6)
7. **Low Priority:** Remove docker-compose version warning (#7)

---

## Quick Wins

These can be fixed quickly:
- ✅ Remove docker-compose version warning (5 minutes)
- ✅ Add axios cookie support (10 minutes)
- ✅ Create CSRF token helper function (15 minutes)

---

## Estimated Time

- **Critical fixes (E2E):** 2-3 hours
- **Medium priority fixes:** 3-4 hours
- **Low priority fixes:** 1 hour
- **Total:** ~6-8 hours

---

## Notes

- E2E tests are close to working - main blocker is CSRF token handling
- Unit tests are mostly passing - failures are mostly database-related
- The dev-test script is working well for infrastructure setup
- Consider creating a test user in database setup for E2E tests

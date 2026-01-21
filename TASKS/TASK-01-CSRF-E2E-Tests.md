# Task 1: Fix CSRF Token Handling in E2E Tests

**Priority:** 🔴 Critical  
**Status:** ✅ COMPLETE - All 35 E2E tests passing!  
**Estimated Time:** 2-3 hours  
**Assignee:** Agent 1

## Problem
E2E tests don't handle CSRF tokens for state-changing requests (POST, PUT, DELETE), causing 23 test failures.

## Current Behavior
- Tests make POST/PUT/DELETE requests without CSRF tokens
- Server returns `403: Invalid or missing CSRF token`
- Registration fails, blocking all subsequent authenticated requests

## Required Changes

### 1. Add CSRF Token Helper Function
Create a helper function similar to unit tests that:
- Calls `GET /api/auth/csrf-token` endpoint
- Extracts token from response
- Extracts cookies from response headers
- Returns both token and cookies

**Reference:** See `src/test/helpers.js` `getCsrfToken` function

### 2. Configure Axios for Cookie Handling
- Install cookie handling library: `axios-cookiejar-support` or `tough-cookie`
- Configure axios instance to handle cookies
- Ensure cookies persist across requests

### 3. Update Test Flow
- Get CSRF token before registration/login
- Store CSRF token and cookies
- Include `x-csrf-token` header in all POST/PUT/DELETE requests
- Include CSRF cookie in all requests

### 4. Update All State-Changing Operations
Update these test cases:
- User registration (`/auth/register`)
- User profile update (`PUT /auth/me`)
- Create player (`POST /players`)
- Update player (`PUT /players/byId/:id`)
- Delete player (`DELETE /players/byId/:id`)
- Create game (`POST /games`)
- Delete game (`DELETE /games/byId/:id`)
- Create schedule (`POST /schedules`)
- Delete schedule (`DELETE /schedules/byId/:id`)

## Files to Modify
- `test-api-routes.js` - Main E2E test file
- `package.json` - Add cookie handling dependency

## Acceptance Criteria
- [x] All 23 currently failing E2E tests pass ✅
- [x] CSRF tokens are properly obtained and used ✅
- [x] Cookies are properly handled in axios ✅
- [x] No CSRF-related errors in test output ✅

## Testing
Run: `API_URL=http://localhost:5001 npm run test:api`

## Notes
- Backend CSRF endpoint: `GET /api/auth/csrf-token`
- Cookie name in development: `psifi.x-csrf-token`
- Token goes in header: `x-csrf-token`
- See unit test implementation in `src/routes/__tests__/vendors.test.js` for reference

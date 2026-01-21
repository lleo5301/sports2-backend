# Task 2: Improve Authentication Token Flow in E2E Tests

**Priority:** 🟡 Medium  
**Status:** ✅ Complete - Login fallback working with CSRF  
**Estimated Time:** 1 hour  
**Assignee:** Agent 2  
**Depends on:** Task 1 (CSRF handling)

## Problem
When registration fails due to CSRF, auth token is never set, causing all subsequent authenticated requests to fail with 401.

## Current Behavior
- Registration fails → no auth token set
- Login fallback exists but may not work properly
- All subsequent requests fail with "Not authorized, no token"

## Required Changes

### 1. Improve Registration Error Handling
- Better error detection for CSRF vs other errors
- Ensure login fallback properly sets auth token
- Add logging for debugging auth flow

### 2. Add Retry Logic
- If registration fails due to CSRF, retry with proper CSRF token
- If user already exists, proceed directly to login
- Ensure auth token is set in both success paths

### 3. Verify Token Persistence
- Ensure `setAuthToken` properly sets axios default headers
- Verify token persists across all test cases
- Add token validation before making authenticated requests

### 4. Add Test User Management
- Consider using a dedicated test user
- Clean up test user between test runs (optional)
- Document test user credentials

## Files to Modify
- `test-api-routes.js` - Improve auth flow in `before` hook and registration test

## Acceptance Criteria
- [ ] Registration or login always results in valid auth token
- [ ] Auth token persists across all test cases
- [ ] No 401 errors due to missing tokens
- [ ] Clear error messages if auth fails

## Testing
Run: `API_URL=http://localhost:5001 npm run test:api`

## Notes
- Test user: `test@example.com` / `testpassword123`
- Token should be set via `setAuthToken()` function
- Token goes in header: `Authorization: Bearer <token>`

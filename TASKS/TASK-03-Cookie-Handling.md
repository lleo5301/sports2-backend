# Task 3: Add Cookie Handling Support to Axios

**Priority:** 🟡 Medium  
**Status:** ✅ Complete - Cookies working perfectly  
**Estimated Time:** 30 minutes  
**Assignee:** Agent 3  
**Depends on:** Task 1 (required for CSRF)

## Problem
Axios doesn't handle cookies by default, which is required for CSRF double-submit cookie pattern to work.

## Current Behavior
- CSRF token endpoint sets cookie
- Cookie is not included in subsequent requests
- CSRF validation fails because cookie is missing

## Required Changes

### 1. Install Cookie Handling Library
Choose one:
- `axios-cookiejar-support` + `tough-cookie` (recommended)
- `axios-cookie-jar-support`
- Manual cookie handling with `tough-cookie`

### 2. Configure Axios Instance
- Create cookie jar
- Configure axios to use cookie jar
- Ensure cookies are sent with requests
- Ensure cookies are stored from responses

### 3. Update Test Setup
- Initialize cookie jar in test setup
- Pass cookie jar to axios instance
- Verify cookies are working

## Files to Modify
- `test-api-routes.js` - Configure axios with cookie support
- `package.json` - Add cookie handling dependencies

## Dependencies to Add
```json
{
  "devDependencies": {
    "axios-cookiejar-support": "^4.0.6",
    "tough-cookie": "^4.1.3"
  }
}
```

## Acceptance Criteria
- [ ] Cookies are properly stored from CSRF token response
- [ ] Cookies are included in subsequent requests
- [ ] CSRF validation passes with cookies
- [ ] No cookie-related errors

## Testing
Run: `API_URL=http://localhost:5001 npm run test:api`

## Notes
- CSRF uses double-submit cookie pattern
- Cookie name: `psifi.x-csrf-token` (development)
- Cookie must match token in header for validation to pass

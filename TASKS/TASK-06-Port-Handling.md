# Task 6: Improve Port Conflict Handling

**Priority:** 🟢 Low  
**Status:** ✅ Complete  
**Estimated Time:** 30 minutes  
**Assignee:** Agent 6

## Problem
Port 5000 is occupied by another process (cc-switch), requiring manual port selection.

## Current Behavior
- Script detects port conflict
- User must manually specify different port
- No automatic fallback to available port

## Required Changes

### 1. Add Automatic Port Selection
- Check if default port is available
- If not, find next available port (5001, 5002, etc.)
- Use found port automatically

### 2. Update Script Logic
- Add function to find available port
- Update backend startup to use found port
- Update E2E test configuration to use found port

### 3. Improve User Feedback
- Log which port is being used
- Warn if using non-default port
- Document port selection in help text

## Files to Modify
- `scripts/dev-test.sh` - Add port finding logic
- Consider: Update E2E test to read port from env

## Acceptance Criteria
- [x] Script automatically finds available port ✅
- [x] No manual port configuration needed ✅
- [x] Clear logging of which port is used ✅
- [x] E2E tests use correct port automatically ✅ (via API_URL env var)

## Testing
- Run script when port 5000 is occupied
- Verify it finds and uses alternative port
- Verify E2E tests connect to correct port

## Notes
- Check ports 5000-5010 for availability
- Update API_URL in test script if port changes
- Consider environment variable for port override

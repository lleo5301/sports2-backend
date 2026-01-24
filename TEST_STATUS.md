# Test Suite Status Report

Generated: 2026-01-23

## Summary
- **Total Test Suites:** 34
- **Passing:** 21 (61.8%)
- **Failing:** 13 (38.2%)
- **Total Tests:** 1,472
- **Passing Tests:** 1,179
- **Failing Tests:** 293

---

## ✅ PASSING Test Suites (21)

| Suite | Tests | Status |
|-------|-------|--------|
| auth.test.js | 13/13 | ✅ |
| csrf.test.js | 20/20 | ✅ |
| csvExport.test.js | 73/73 | ✅ |
| depthCharts.test.js | 128/128 | ✅ |
| errorHandler.test.js | 22/22 | ✅ |
| helmet.test.js | 36/36 | ✅ |
| jwtSecretValidator.test.js | 60/60 | ✅ |
| locations.test.js | 69/69 | ✅ |
| lockoutService.test.js | 33/33 | ✅ |
| logger.test.js | 69/69 | ✅ |
| notificationService.test.js | 20/20 | ✅ |
| passwordValidator.test.js | 65/65 | ✅ |
| permissions.test.js | 5/5 | ✅ |
| reports.test.js | 8/8 | ✅ |
| scheduleTemplates.test.js | 12/12 | ✅ |
| scouts.test.js | 66/66 | ✅ |
| securityHeaders.test.js | 21/21 | ✅ |
| settings.test.js | 16/16 | ✅ |
| sorting.test.js | 123/123 | ✅ |
| tokenBlacklistService.test.js | 22/22 | ✅ |
| validateEnv.test.js | 23/23 | ✅ |

---

## ❌ FAILING Test Suites (13)

### 🔴 Critical (>50% failures)
| Suite | Passed | Failed | Total | Failure Rate |
|-------|--------|--------|-------|--------------|
| scheduleEvents.test.js | 0 | 61 | 61 | 100% |
| recruits.test.js | 15 | 52 | 67 | 77.6% |
| games.test.js | 11 | 36 | 47 | 76.6% |

### 🟠 High Priority (20-50% failures)
| Suite | Passed | Failed | Total | Failure Rate |
|-------|--------|--------|-------|--------------|
| teams.test.js | 82 | 30 | 112 | 26.8% |
| coaches.test.js | 51 | 25 | 76 | 32.9% |
| vendors.test.js | 49 | 21 | 70 | 30.0% |

### 🟡 Medium Priority (10-20% failures)
| Suite | Passed | Failed | Total | Failure Rate |
|-------|--------|--------|-------|--------------|
| schedules.test.js | 63 | 14 | 77 | 18.2% |

### 🟢 Low Priority (<10% failures)
| Suite | Passed | Failed | Total | Failure Rate |
|-------|--------|--------|-------|--------------|
| auth.lockout.test.js | 25 | 3 | 28 | 10.7% |
| csrf.integration.test.js | 19 | 2 | 21 | 9.5% |
| players.performance.test.js | 12 | 2 | 14 | 14.3% |
| players.unit.test.js | 5 | 2 | 7 | 28.6% |
| highSchoolCoaches.test.js | 93 | 1 | 94 | 1.1% |

---

## Refactoring Strategy

### Phase 1: Critical Fixes (3 suites)
1. **scheduleEvents.test.js** - Complete rewrite needed (0% passing)
2. **recruits.test.js** - Major refactor (77.6% failing)
3. **games.test.js** - Major refactor (76.6% failing)

### Phase 2: High Priority (3 suites)
4. **teams.test.js** - Partial refactor (26.8% failing)
5. **coaches.test.js** - Partial refactor (32.9% failing)
6. **vendors.test.js** - Partial refactor (30.0% failing)

### Phase 3: Medium & Low Priority (7 suites)
7. **schedules.test.js** - Minor fixes (18.2% failing)
8. **auth.lockout.test.js** - Minor fixes (10.7% failing)
9. **csrf.integration.test.js** - Minor fixes (9.5% failing)
10. **players.performance.test.js** - Minor fixes (14.3% failing)
11. **players.unit.test.js** - Minor fixes (28.6% failing)
12. **highSchoolCoaches.test.js** - Quick fix (1.1% failing)

---

## Notes
- **auth.test.js** appears twice in results - duplicate run with different outcomes
- All passing suites should remain untouched
- Refactoring approach: same as reports.test.js (clean slate, global setup, minimal passing tests)

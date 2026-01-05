/**
 * @fileoverview Report routes - Re-export from modular structure.
 * This file maintains backward compatibility with existing imports while
 * the actual implementation is now split into domain-specific modules
 * in the reports/ directory.
 *
 * The report functionality is now organized as follows:
 * - reports/index.js - Core custom report CRUD (list, get, create, update, delete)
 * - reports/scouting.js - Scouting report management (create, update, list, get evaluations)
 * - reports/analytics.js - Analytics endpoints (player-performance, team-statistics, scouting-analysis, recruitment-pipeline)
 * - reports/exports.js - Export routes (PDF generation, Excel export)
 * - reports/validators.js - Shared validation rules
 * - reports/helpers.js - Shared helper functions (gradeToNumeric conversion)
 *
 * @module routes/reports
 */

module.exports = require('./reports/index');
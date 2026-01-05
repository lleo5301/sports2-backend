/**
 * @fileoverview Team routes - Re-export from modular structure.
 * This file maintains backward compatibility with existing imports while
 * the actual implementation is now split into domain-specific modules
 * in the teams/ directory.
 *
 * The team functionality is now organized as follows:
 * - teams/index.js - Core CRUD operations (list, create, get, update, user listing)
 * - teams/branding.js - Branding management (logo upload/delete, brand colors)
 * - teams/permissions.js - Permission management (create, update, delete user permissions)
 * - teams/schedules.js - Schedule retrieval (recent and upcoming schedule events)
 * - teams/stats.js - Team statistics and roster by position
 * - teams/validators.js - Shared validation rules
 * - teams/helpers.js - Shared helper functions (branding permissions)
 *
 * @module routes/teams
 */

module.exports = require('./teams/index');

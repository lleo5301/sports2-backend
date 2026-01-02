/**
 * @fileoverview Depth chart routes - Re-export from modular structure.
 * This file maintains backward compatibility with existing imports while
 * the actual implementation is now split into domain-specific modules
 * in the depthCharts/ directory.
 *
 * The depth chart functionality is now organized as follows:
 * - depthCharts/index.js - Core CRUD operations (list, get, create, update, delete, duplicate, history)
 * - depthCharts/positions.js - Position management (add, update, delete positions)
 * - depthCharts/players.js - Player assignments (assign, remove, get available players)
 * - depthCharts/recommendations.js - Player recommendations with scoring algorithms
 * - depthCharts/validators.js - Shared validation rules
 * - depthCharts/helpers.js - Shared helper functions (scoring algorithms)
 *
 * @module routes/depthCharts
 */

module.exports = require('./depthCharts/index');

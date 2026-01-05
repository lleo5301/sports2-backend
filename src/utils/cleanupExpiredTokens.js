#!/usr/bin/env node

/**
 * Token Blacklist Cleanup Utility
 *
 * Removes expired token entries from the token_blacklist table to prevent
 * database bloat and maintain optimal query performance. This script should
 * be run periodically via cron job or scheduled task.
 *
 * Usage:
 *   node backend/src/utils/cleanupExpiredTokens.js
 *   npm run db:cleanup-tokens (from backend directory)
 *
 * Recommended Schedule:
 *   - Run daily during low-traffic hours (e.g., 2 AM)
 *   - Cron example: 0 2 * * * cd /path/to/backend && npm run db:cleanup-tokens
 */

require('dotenv').config();
const { sequelize } = require('../config/database');
const tokenBlacklistService = require('../services/tokenBlacklistService');

/**
 * Main cleanup execution function.
 * Connects to database, runs cleanup, and handles exit.
 */
async function main() {
  const startTime = Date.now();

  process.stdout.write('\n');
  process.stdout.write('================================================================================\n');
  process.stdout.write('              TOKEN BLACKLIST CLEANUP UTILITY\n');
  process.stdout.write('================================================================================\n');
  process.stdout.write('\n');
  process.stdout.write('Starting cleanup of expired token blacklist entries...\n\n');

  try {
    // Test database connection
    await sequelize.authenticate();
    process.stdout.write('✓ Database connection established\n');

    // Run the cleanup operation
    const deletedCount = await tokenBlacklistService.cleanupExpiredTokens();

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    process.stdout.write('\n');
    process.stdout.write('================================================================================\n');
    process.stdout.write('                      CLEANUP COMPLETE\n');
    process.stdout.write('================================================================================\n');
    process.stdout.write('\n');
    process.stdout.write(`Expired entries removed: ${deletedCount}\n`);
    process.stdout.write(`Execution time: ${elapsedTime} seconds\n`);
    process.stdout.write(`Completed at: ${new Date().toISOString()}\n`);
    process.stdout.write('\n');
    process.stdout.write('================================================================================\n');
    process.stdout.write('\n');

    // Close database connection
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    process.stderr.write('\n');
    process.stderr.write('================================================================================\n');
    process.stderr.write('                         ERROR\n');
    process.stderr.write('================================================================================\n');
    process.stderr.write('\n');
    process.stderr.write(`Failed to cleanup expired tokens: ${error.message}\n`);
    process.stderr.write('\n');

    if (process.env.NODE_ENV === 'development') {
      process.stderr.write('Stack trace:\n');
      process.stderr.write(error.stack + '\n');
      process.stderr.write('\n');
    }

    process.stderr.write('================================================================================\n');
    process.stderr.write('\n');

    // Close database connection even on error
    try {
      await sequelize.close();
    } catch (closeError) {
      // Ignore close errors
    }

    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };

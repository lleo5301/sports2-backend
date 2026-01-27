'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    // Add new sync_type enum values for the additional PrestoSports endpoints
    // PostgreSQL requires adding each value individually to an existing enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_sync_logs_sync_type" ADD VALUE IF NOT EXISTS 'player_details';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_sync_logs_sync_type" ADD VALUE IF NOT EXISTS 'player_photos';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_sync_logs_sync_type" ADD VALUE IF NOT EXISTS 'press_releases';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_sync_logs_sync_type" ADD VALUE IF NOT EXISTS 'historical_stats';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_sync_logs_sync_type" ADD VALUE IF NOT EXISTS 'player_videos';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_sync_logs_sync_type" ADD VALUE IF NOT EXISTS 'live_stats';
    `);
  },

  async down(_queryInterface, _Sequelize) {
    // PostgreSQL doesn't support removing enum values directly
    // To fully reverse this, you would need to:
    // 1. Create a new enum without these values
    // 2. Update the column to use the new enum
    // 3. Drop the old enum
    // This is rarely needed in practice, so we leave this as a no-op
    console.log('Note: Removing enum values requires manual database intervention');
  }
};

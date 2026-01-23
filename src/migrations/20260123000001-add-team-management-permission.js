'use strict';

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    // Add 'team_management' to the permission_type enum
    // PostgreSQL requires ALTER TYPE to add new values to an existing enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_user_permissions_permission_type" ADD VALUE IF NOT EXISTS 'team_management';
    `).catch((err) => {
      // If the value already exists or the type doesn't exist yet, ignore
      if (!err.message.includes('already exists') && !err.message.includes('does not exist')) {
        throw err;
      }
    });
  },

  down: (_queryInterface, _Sequelize) => {
    // PostgreSQL doesn't support removing enum values easily
    // This would require recreating the enum type, which is complex
    // and not typically done in production downgrades
    console.log('Removing enum values is not supported in PostgreSQL');
  }
};

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Guard against missing table
    try {
      await queryInterface.describeTable('users');
    } catch (err) {
      console.warn('[migration:add-account-lockout-fields] users table not found; skipping migration.');
      return;
    }

    const usersTable = await queryInterface.describeTable('users');

    // Add failed_login_attempts column
    if (!usersTable.failed_login_attempts) {
      await queryInterface.addColumn('users', 'failed_login_attempts', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of consecutive failed login attempts'
      });
    }

    // Add locked_until column
    if (!usersTable.locked_until) {
      await queryInterface.addColumn('users', 'locked_until', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp until which the account is locked'
      });
    }

    // Add last_failed_login column
    if (!usersTable.last_failed_login) {
      await queryInterface.addColumn('users', 'last_failed_login', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp of the last failed login attempt'
      });
    }

    // Add index on locked_until for efficient queries when checking locked accounts
    try {
      await queryInterface.addIndex('users', ['locked_until'], {
        name: 'users_locked_until_idx'
      });
    } catch (e) {
      // Index may already exist
    }
  },

  down: async (queryInterface, _Sequelize) => {
    try {
      await queryInterface.describeTable('users');
    } catch (err) {
      // Table doesn't exist; nothing to do
      return;
    }

    const usersTable = await queryInterface.describeTable('users');

    // Remove index first
    try {
      await queryInterface.removeIndex('users', 'users_locked_until_idx');
    } catch (e) {
      // Index may not exist
    }

    // Remove columns
    if (usersTable.last_failed_login) {
      await queryInterface.removeColumn('users', 'last_failed_login');
    }

    if (usersTable.locked_until) {
      await queryInterface.removeColumn('users', 'locked_until');
    }

    if (usersTable.failed_login_attempts) {
      await queryInterface.removeColumn('users', 'failed_login_attempts');
    }
  }
};

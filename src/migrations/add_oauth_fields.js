'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Guard each alteration to avoid errors on reset
    const usersTable = await queryInterface.describeTable('users');
    if (!usersTable.oauth_provider) {
      await queryInterface.addColumn('users', 'oauth_provider', {
        type: Sequelize.ENUM('google', 'apple', 'local'),
        allowNull: false,
        defaultValue: 'local'
      });
    }

    if (!usersTable.oauth_id) {
      await queryInterface.addColumn('users', 'oauth_id', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      });
    }

    if (!usersTable.avatar_url) {
      await queryInterface.addColumn('users', 'avatar_url', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    // Make password nullable for OAuth users
    try {
      await queryInterface.changeColumn('users', 'password', {
        type: Sequelize.STRING,
        allowNull: true,
        validate: {
          len: [6, 100]
        }
      });
    } catch (e) {}

    // Add unique constraint for oauth_provider + oauth_id combination
    try {
      await queryInterface.addIndex('users', ['oauth_provider', 'oauth_id'], {
        unique: true,
        where: {
          oauth_id: {
            [Sequelize.Op.ne]: null
          }
        }
      });
    } catch (e) {}
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('users', ['oauth_provider', 'oauth_id']);
    await queryInterface.removeColumn('users', 'avatar_url');
    await queryInterface.removeColumn('users', 'oauth_id');
    await queryInterface.removeColumn('users', 'oauth_provider');

    // Restore password as required
    await queryInterface.changeColumn('users', 'password', {
      type: Sequelize.STRING,
      allowNull: false,
      validate: {
        len: [6, 100]
      }
    });
  }
};

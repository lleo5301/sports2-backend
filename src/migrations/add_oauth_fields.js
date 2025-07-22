'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'oauth_provider', {
      type: Sequelize.ENUM('google', 'apple', 'local'),
      allowNull: false,
      defaultValue: 'local'
    });

    await queryInterface.addColumn('users', 'oauth_id', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true
    });

    await queryInterface.addColumn('users', 'avatar_url', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // Make password nullable for OAuth users
    await queryInterface.changeColumn('users', 'password', {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        len: [6, 100]
      }
    });

    // Add unique constraint for oauth_provider + oauth_id combination
    await queryInterface.addIndex('users', ['oauth_provider', 'oauth_id'], {
      unique: true,
      where: {
        oauth_id: {
          [Sequelize.Op.ne]: null
        }
      }
    });
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
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Helper function to check if column exists
    const columnExists = async (tableName, columnName) => {
      try {
        const [results] = await queryInterface.sequelize.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        `, {
          bind: [tableName, columnName],
          type: queryInterface.sequelize.QueryTypes.SELECT
        });
        return results && results.length > 0;
      } catch (error) {
        // If table doesn't exist, column doesn't exist
        return false;
      }
    };
    // Guard each alteration to avoid errors on reset
    try {
      if (!(await columnExists('users', 'oauth_provider'))) {
        await queryInterface.addColumn('users', 'oauth_provider', {
          type: Sequelize.ENUM('google', 'apple', 'local'),
          allowNull: false,
          defaultValue: 'local'
        });
      }
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }

    try {
      if (!(await columnExists('users', 'oauth_id'))) {
        await queryInterface.addColumn('users', 'oauth_id', {
          type: Sequelize.STRING,
          allowNull: true,
          unique: true
        });
      }
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }

    try {
      if (!(await columnExists('users', 'avatar_url'))) {
        await queryInterface.addColumn('users', 'avatar_url', {
          type: Sequelize.STRING,
          allowNull: true
        });
      }
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
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
    } catch (e) {
      // Column may already be configured
    }

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
    } catch (e) {
      // Index may already exist
    }
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

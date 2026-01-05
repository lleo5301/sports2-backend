'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_teams', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'teams',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      role: {
        type: Sequelize.ENUM('primary', 'secondary'),
        defaultValue: 'secondary',
        allowNull: false,
        comment: 'Primary is the main team, secondary for additional teams'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add unique constraint to prevent duplicate user-team associations
    await queryInterface.addIndex('user_teams', ['user_id', 'team_id'], {
      unique: true,
      name: 'user_teams_user_team_unique'
    });

    // Add index for faster lookups
    await queryInterface.addIndex('user_teams', ['user_id']);
    await queryInterface.addIndex('user_teams', ['team_id']);

    // Migrate existing user-team relationships from users.team_id to user_teams table
    await queryInterface.sequelize.query(`
      INSERT INTO user_teams (user_id, team_id, role, is_active, created_at, updated_at)
      SELECT id, team_id, 'primary', true, NOW(), NOW()
      FROM users
      WHERE team_id IS NOT NULL
    `);
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.dropTable('user_teams');
  }
};

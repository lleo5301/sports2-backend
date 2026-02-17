'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rosters', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(150),
        allowNull: false
      },
      roster_type: {
        type: Sequelize.ENUM('game_day', 'travel', 'practice', 'season', 'custom'),
        allowNull: false,
        defaultValue: 'custom'
      },
      source: {
        type: Sequelize.ENUM('manual', 'presto'),
        allowNull: false,
        defaultValue: 'manual'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      game_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'games', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      effective_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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

    await queryInterface.addIndex('rosters', ['team_id'], {
      name: 'idx_rosters_team_id'
    });
    await queryInterface.addIndex('rosters', ['roster_type'], {
      name: 'idx_rosters_roster_type'
    });
    await queryInterface.addIndex('rosters', ['source'], {
      name: 'idx_rosters_source'
    });
    await queryInterface.addIndex('rosters', ['game_id'], {
      name: 'idx_rosters_game_id'
    });
    // Prevent duplicate backfills: one presto roster per game per team
    await queryInterface.addIndex('rosters', ['team_id', 'game_id'], {
      name: 'idx_rosters_team_game_unique',
      unique: true,
      where: { game_id: { [Sequelize.Op.ne]: null } }
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('rosters');
  }
};

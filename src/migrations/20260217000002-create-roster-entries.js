'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('roster_entries', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      roster_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'rosters', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'players', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      position: {
        type: Sequelize.STRING(10),
        allowNull: true
      },
      jersey_number: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'injured', 'suspended', 'inactive'),
        allowNull: false,
        defaultValue: 'active'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
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

    // A player can only appear once per roster
    await queryInterface.addIndex('roster_entries', ['roster_id', 'player_id'], {
      name: 'idx_roster_entries_roster_player_unique',
      unique: true
    });
    await queryInterface.addIndex('roster_entries', ['player_id'], {
      name: 'idx_roster_entries_player_id'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('roster_entries');
  }
};

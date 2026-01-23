'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('preference_lists', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'players',
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
      list_type: {
        type: Sequelize.ENUM('new_players', 'overall_pref_list', 'hs_pref_list', 'college_transfers'),
        allowNull: false
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 999
      },
      added_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      added_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'committed', 'signed', 'lost'),
        defaultValue: 'active'
      },
      last_contact_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      next_contact_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      contact_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      interest_level: {
        type: Sequelize.ENUM('High', 'Medium', 'Low', 'Unknown'),
        allowNull: true
      },
      visit_scheduled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      visit_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      scholarship_offered: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      scholarship_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      transfer_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      eligibility_remaining: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      academic_standing: {
        type: Sequelize.ENUM('Good', 'Warning', 'Probation', 'Unknown'),
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

    await queryInterface.addIndex('preference_lists', ['player_id', 'team_id', 'list_type'], {
      unique: true
    });
    await queryInterface.addIndex('preference_lists', ['team_id', 'list_type', 'priority']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('preference_lists');
  }
};

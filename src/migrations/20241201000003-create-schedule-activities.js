'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('schedule_activities', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      section_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'schedule_sections',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      time: {
        type: Sequelize.STRING,
        allowNull: false
      },
      activity: {
        type: Sequelize.STRING,
        allowNull: false
      },
      location: {
        type: Sequelize.STRING,
        allowNull: true
      },
      staff: {
        type: Sequelize.STRING,
        allowNull: true
      },
      group: {
        type: Sequelize.STRING,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      sort_order: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('schedule_activities', ['section_id']);
    await queryInterface.addIndex('schedule_activities', ['time']);
    await queryInterface.addIndex('schedule_activities', ['sort_order']);
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.dropTable('schedule_activities');
  }
};

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reports', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      type: {
        type: Sequelize.ENUM('player-performance', 'team-statistics', 'scouting-analysis', 'recruitment-pipeline', 'custom'),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'archived'),
        defaultValue: 'draft',
        allowNull: false
      },
      data_sources: {
        type: Sequelize.JSON,
        allowNull: true
      },
      sections: {
        type: Sequelize.JSON,
        allowNull: true
      },
      filters: {
        type: Sequelize.JSON,
        allowNull: true
      },
      schedule: {
        type: Sequelize.JSON,
        allowNull: true
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
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      last_generated: {
        type: Sequelize.DATE,
        allowNull: true
      },
      generation_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
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

    await queryInterface.addIndex('reports', ['team_id']);
    await queryInterface.addIndex('reports', ['created_by']);
    await queryInterface.addIndex('reports', ['type']);
    await queryInterface.addIndex('reports', ['status']);
    await queryInterface.addIndex('reports', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reports');
  }
};

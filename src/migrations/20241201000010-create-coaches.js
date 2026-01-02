'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('coaches', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      school_name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      position: {
        type: Sequelize.ENUM('Head Coach', 'Recruiting Coordinator', 'Pitching Coach', 'Volunteer'),
        allowNull: false
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
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
        onDelete: 'RESTRICT'
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
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        defaultValue: 'active'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add indexes
    await queryInterface.addIndex('coaches', ['team_id'], { name: 'coaches_team_id_idx' });
    await queryInterface.addIndex('coaches', ['school_name'], { name: 'coaches_school_name_idx' });
    await queryInterface.addIndex('coaches', ['status'], { name: 'coaches_status_idx' });
    await queryInterface.addIndex('coaches', ['team_id', 'status'], { name: 'coaches_team_id_status_idx' });
  },

  async down(queryInterface, _Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('coaches', 'coaches_team_id_status_idx');
    await queryInterface.removeIndex('coaches', 'coaches_status_idx');
    await queryInterface.removeIndex('coaches', 'coaches_school_name_idx');
    await queryInterface.removeIndex('coaches', 'coaches_team_id_idx');

    await queryInterface.dropTable('coaches');
  }
};

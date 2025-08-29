'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('high_school_coaches', {
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
      school_district: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      position: {
        type: Sequelize.ENUM(
          'Head Coach', 
          'Assistant Coach', 
          'JV Coach', 
          'Freshman Coach', 
          'Pitching Coach', 
          'Hitting Coach'
        ),
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
      city: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      state: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      region: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      years_coaching: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      conference: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      school_classification: {
        type: Sequelize.ENUM('1A', '2A', '3A', '4A', '5A', '6A', 'Private'),
        allowNull: true
      },
      relationship_type: {
        type: Sequelize.ENUM(
          'Recruiting Contact',
          'Former Player',
          'Coaching Connection',
          'Tournament Contact',
          'Camp Contact',
          'Other'
        ),
        defaultValue: 'Recruiting Contact'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
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
      players_sent_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        defaultValue: 'active'
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
    await queryInterface.addIndex('high_school_coaches', ['team_id'], { name: 'hs_coaches_team_id_idx' });
    await queryInterface.addIndex('high_school_coaches', ['school_name'], { name: 'hs_coaches_school_name_idx' });
    await queryInterface.addIndex('high_school_coaches', ['status'], { name: 'hs_coaches_status_idx' });
    await queryInterface.addIndex('high_school_coaches', ['state'], { name: 'hs_coaches_state_idx' });
    await queryInterface.addIndex('high_school_coaches', ['relationship_type'], { name: 'hs_coaches_relationship_idx' });
    await queryInterface.addIndex('high_school_coaches', ['team_id', 'status'], { name: 'hs_coaches_team_id_status_idx' });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('high_school_coaches', 'hs_coaches_team_id_status_idx');
    await queryInterface.removeIndex('high_school_coaches', 'hs_coaches_relationship_idx');
    await queryInterface.removeIndex('high_school_coaches', 'hs_coaches_state_idx');
    await queryInterface.removeIndex('high_school_coaches', 'hs_coaches_status_idx');
    await queryInterface.removeIndex('high_school_coaches', 'hs_coaches_school_name_idx');
    await queryInterface.removeIndex('high_school_coaches', 'hs_coaches_team_id_idx');

    await queryInterface.dropTable('high_school_coaches');
  }
};

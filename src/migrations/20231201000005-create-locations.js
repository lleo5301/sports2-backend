'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('locations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      address: {
        type: Sequelize.STRING,
        allowNull: true
      },
      city: {
        type: Sequelize.STRING,
        allowNull: true
      },
      state: {
        type: Sequelize.STRING,
        allowNull: true
      },
      zip_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      location_type: {
        type: Sequelize.ENUM(
          'field',
          'gym',
          'facility',
          'stadium',
          'practice_field',
          'batting_cage',
          'weight_room',
          'classroom',
          'other'
        ),
        allowNull: false,
        defaultValue: 'field'
      },
      capacity: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      contact_info: {
        type: Sequelize.JSON,
        allowNull: true
      },
      amenities: {
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
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      is_home_venue: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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

    await queryInterface.addIndex('locations', ['team_id']);
    await queryInterface.addIndex('locations', ['created_by']);
    await queryInterface.addIndex('locations', ['location_type']);
    await queryInterface.addIndex('locations', ['is_active']);
    await queryInterface.addIndex('locations', ['is_home_venue']);
    await queryInterface.addIndex('locations', ['name', 'team_id'], {
      unique: true,
      name: 'unique_location_name_per_team'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('locations');
  }
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vendors', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      company_name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      contact_person: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      address: {
        type: Sequelize.TEXT,
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
      zip_code: {
        type: Sequelize.STRING(10),
        allowNull: true
      },
      website: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      vendor_type: {
        type: Sequelize.ENUM(
          'Equipment', 
          'Apparel', 
          'Technology', 
          'Food Service', 
          'Transportation', 
          'Medical', 
          'Facilities', 
          'Other'
        ),
        allowNull: false
      },
      services_provided: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      contract_start_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      contract_end_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      contract_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      payment_terms: {
        type: Sequelize.STRING(100),
        allowNull: true
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
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'pending', 'expired'),
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
    await queryInterface.addIndex('vendors', ['team_id'], { name: 'vendors_team_id_idx' });
    await queryInterface.addIndex('vendors', ['vendor_type'], { name: 'vendors_type_idx' });
    await queryInterface.addIndex('vendors', ['status'], { name: 'vendors_status_idx' });
    await queryInterface.addIndex('vendors', ['company_name'], { name: 'vendors_company_name_idx' });
    await queryInterface.addIndex('vendors', ['team_id', 'status'], { name: 'vendors_team_id_status_idx' });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('vendors', 'vendors_team_id_status_idx');
    await queryInterface.removeIndex('vendors', 'vendors_company_name_idx');
    await queryInterface.removeIndex('vendors', 'vendors_status_idx');
    await queryInterface.removeIndex('vendors', 'vendors_type_idx');
    await queryInterface.removeIndex('vendors', 'vendors_team_id_idx');

    await queryInterface.dropTable('vendors');
  }
};

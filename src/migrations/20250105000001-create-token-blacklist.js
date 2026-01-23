'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.sequelize.query(
      "SELECT to_regclass('public.token_blacklist') as exists",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (tables[0] && tables[0].exists) {
      return;
    }
    await queryInterface.createTable('token_blacklist', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      jti: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: 'JWT ID - unique identifier for the token'
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
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'Timestamp when the token was revoked'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Original token expiration time for cleanup purposes'
      },
      reason: {
        type: Sequelize.ENUM(
          'logout',
          'password_change',
          'admin_revoke',
          'security_revoke'
        ),
        allowNull: false,
        comment: 'Reason for token revocation'
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

    // Add indexes for efficient lookups
    await queryInterface.addIndex('token_blacklist', ['jti'], {
      name: 'idx_token_blacklist_jti',
      unique: true
    });
    await queryInterface.addIndex('token_blacklist', ['user_id']);
    await queryInterface.addIndex('token_blacklist', ['expires_at']);
    await queryInterface.addIndex('token_blacklist', ['reason']);
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.dropTable('token_blacklist');
  }
};

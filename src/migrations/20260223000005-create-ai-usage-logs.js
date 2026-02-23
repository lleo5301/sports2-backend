'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_usage_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teams', key: 'id' },
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'ai_conversations', key: 'id' },
        onDelete: 'SET NULL'
      },
      model: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      input_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      output_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      cost_usd: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: false,
        defaultValue: 0
      },
      key_source: {
        type: Sequelize.ENUM('platform', 'byok'),
        allowNull: false,
        defaultValue: 'platform'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('ai_usage_logs', ['team_id']);
    await queryInterface.addIndex('ai_usage_logs', ['user_id']);
    await queryInterface.addIndex('ai_usage_logs', ['created_at']);
    await queryInterface.addIndex('ai_usage_logs', ['conversation_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_usage_logs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ai_usage_logs_key_source";');
  }
};

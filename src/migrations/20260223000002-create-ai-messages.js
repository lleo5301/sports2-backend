'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_messages', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'ai_conversations', key: 'id' },
        onDelete: 'CASCADE'
      },
      role: {
        type: Sequelize.ENUM('user', 'assistant', 'tool_call', 'tool_result'),
        allowNull: false
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tool_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      token_count: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('ai_messages', ['conversation_id']);
    await queryInterface.addIndex('ai_messages', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_messages');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ai_messages_role";');
  }
};

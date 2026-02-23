'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_insights', {
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
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      category: {
        type: Sequelize.ENUM(
          'player_performance', 'pitching_analysis', 'recruiting',
          'lineup', 'scouting', 'game_recap', 'weekly_digest'
        ),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      data_snapshot: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      prompt_used: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_pinned: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('ai_insights', ['team_id']);
    await queryInterface.addIndex('ai_insights', ['category']);
    await queryInterface.addIndex('ai_insights', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_insights');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ai_insights_category";');
  }
};

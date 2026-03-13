'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('scouting_reports', 'report_type', {
      type: Sequelize.STRING(10),
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'role', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'round_would_take', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'money_save', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'overpay', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'dollar_amount', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'report_confidence', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'impact_statement', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'summary', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'look_recommendation', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'look_recommendation_desc', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'player_comparison', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'date_seen_start', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'date_seen_end', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'video_report', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });
    await queryInterface.addColumn('scouting_reports', 'tool_grades', {
      type: Sequelize.JSONB,
      allowNull: true
    });

    // CHECK constraints for queryable fields
    await queryInterface.sequelize.query(`
      ALTER TABLE scouting_reports
        ADD CONSTRAINT scouting_report_type_check
        CHECK (report_type IS NULL OR report_type IN ('hitter', 'pitcher'))
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE scouting_reports
        ADD CONSTRAINT scouting_role_check
        CHECK (role IS NULL OR (role >= 1 AND role <= 5))
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE scouting_reports
        ADD CONSTRAINT scouting_report_confidence_check
        CHECK (report_confidence IS NULL OR report_confidence IN ('High', 'Medium', 'Low'))
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE scouting_reports
        ADD CONSTRAINT scouting_look_recommendation_check
        CHECK (look_recommendation IS NULL OR (look_recommendation >= 20 AND look_recommendation <= 80 AND look_recommendation % 5 = 0))
    `);
  },

  async down(queryInterface) {
    // Remove CHECK constraints first
    await queryInterface.sequelize.query('ALTER TABLE scouting_reports DROP CONSTRAINT IF EXISTS scouting_look_recommendation_check');
    await queryInterface.sequelize.query('ALTER TABLE scouting_reports DROP CONSTRAINT IF EXISTS scouting_report_confidence_check');
    await queryInterface.sequelize.query('ALTER TABLE scouting_reports DROP CONSTRAINT IF EXISTS scouting_role_check');
    await queryInterface.sequelize.query('ALTER TABLE scouting_reports DROP CONSTRAINT IF EXISTS scouting_report_type_check');

    // Remove columns in reverse order
    const cols = [
      'tool_grades', 'video_report', 'date_seen_end', 'date_seen_start',
      'player_comparison', 'look_recommendation_desc', 'look_recommendation',
      'summary', 'impact_statement', 'report_confidence', 'dollar_amount',
      'overpay', 'money_save', 'round_would_take', 'role', 'report_type'
    ];
    for (const col of cols) {
      await queryInterface.removeColumn('scouting_reports', col);
    }
  }
};

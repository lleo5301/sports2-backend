'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add prospect_id FK
    await queryInterface.addColumn('scouting_reports', 'prospect_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'prospects', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    // 2. Make player_id nullable
    await queryInterface.changeColumn('scouting_reports', 'player_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'players', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    // 3. Add CHECK constraint: exactly one of player_id or prospect_id must be set
    await queryInterface.sequelize.query(`
      ALTER TABLE scouting_reports
      ADD CONSTRAINT scouting_report_target CHECK (
        (player_id IS NOT NULL AND prospect_id IS NULL) OR
        (player_id IS NULL AND prospect_id IS NOT NULL)
      );
    `);

    // 4. Add all new INTEGER grade columns (present/future pairs)
    const gradeColumns = [
      'overall_present', 'overall_future',
      'hitting_present', 'hitting_future',
      'bat_speed_present', 'bat_speed_future',
      'raw_power_present', 'raw_power_future',
      'game_power_present', 'game_power_future',
      'plate_discipline_present', 'plate_discipline_future',
      'pitching_present', 'pitching_future',
      'fastball_present', 'fastball_future',
      'curveball_present', 'curveball_future',
      'slider_present', 'slider_future',
      'changeup_present', 'changeup_future',
      'command_present', 'command_future',
      'fielding_present', 'fielding_future',
      'arm_strength_present', 'arm_strength_future',
      'arm_accuracy_present', 'arm_accuracy_future',
      'range_present', 'range_future',
      'hands_present', 'hands_future',
      'speed_present', 'speed_future',
      'baserunning_present', 'baserunning_future',
      'intangibles_present', 'intangibles_future',
      'work_ethic_grade', 'coachability_grade',
      'baseball_iq_present', 'baseball_iq_future',
      'overall_future_potential'
    ];

    for (const col of gradeColumns) {
      await queryInterface.addColumn('scouting_reports', col, {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    // 5. Add CHECK constraints for grade values via raw SQL
    const checkConstraints = gradeColumns.map((col) =>
      `ALTER TABLE scouting_reports ADD CONSTRAINT chk_${col} CHECK ("${col}" BETWEEN 20 AND 80);`
    );
    for (const sql of checkConstraints) {
      await queryInterface.sequelize.query(sql);
    }

    // 6. Add other new columns
    await queryInterface.addColumn('scouting_reports', 'sixty_yard_dash', {
      type: Sequelize.DECIMAL(4, 2),
      allowNull: true
    });

    await queryInterface.addColumn('scouting_reports', 'mlb_comparison', {
      type: Sequelize.STRING(100),
      allowNull: true
    });

    await queryInterface.addColumn('scouting_reports', 'event_type', {
      type: Sequelize.ENUM('game', 'showcase', 'practice', 'workout', 'video'),
      allowNull: true,
      defaultValue: 'game'
    });

    // 7. Add indexes for prospect_id lookups
    await queryInterface.addIndex('scouting_reports', ['prospect_id'], {
      name: 'idx_scouting_reports_prospect'
    });
  },

  async down(queryInterface, _Sequelize) {
    // Remove index
    await queryInterface.removeIndex('scouting_reports', 'idx_scouting_reports_prospect');

    // Drop CHECK constraint
    await queryInterface.sequelize.query(
      'ALTER TABLE scouting_reports DROP CONSTRAINT IF EXISTS scouting_report_target;'
    );

    // Drop grade CHECK constraints
    const gradeColumns = [
      'overall_present', 'overall_future',
      'hitting_present', 'hitting_future',
      'bat_speed_present', 'bat_speed_future',
      'raw_power_present', 'raw_power_future',
      'game_power_present', 'game_power_future',
      'plate_discipline_present', 'plate_discipline_future',
      'pitching_present', 'pitching_future',
      'fastball_present', 'fastball_future',
      'curveball_present', 'curveball_future',
      'slider_present', 'slider_future',
      'changeup_present', 'changeup_future',
      'command_present', 'command_future',
      'fielding_present', 'fielding_future',
      'arm_strength_present', 'arm_strength_future',
      'arm_accuracy_present', 'arm_accuracy_future',
      'range_present', 'range_future',
      'hands_present', 'hands_future',
      'speed_present', 'speed_future',
      'baserunning_present', 'baserunning_future',
      'intangibles_present', 'intangibles_future',
      'work_ethic_grade', 'coachability_grade',
      'baseball_iq_present', 'baseball_iq_future',
      'overall_future_potential'
    ];

    for (const col of gradeColumns) {
      await queryInterface.sequelize.query(
        `ALTER TABLE scouting_reports DROP CONSTRAINT IF EXISTS chk_${col};`
      );
    }

    // Remove new columns (reverse order)
    await queryInterface.removeColumn('scouting_reports', 'event_type');
    await queryInterface.removeColumn('scouting_reports', 'mlb_comparison');
    await queryInterface.removeColumn('scouting_reports', 'sixty_yard_dash');

    for (const col of gradeColumns.reverse()) {
      await queryInterface.removeColumn('scouting_reports', col);
    }

    // Remove prospect_id
    await queryInterface.removeColumn('scouting_reports', 'prospect_id');

    // Restore player_id NOT NULL
    await queryInterface.changeColumn('scouting_reports', 'player_id', {
      type: require('sequelize').INTEGER,
      allowNull: false,
      references: { model: 'players', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    // Drop event_type enum
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_scouting_reports_event_type";');
  }
};

'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE scouting_reports ALTER COLUMN player_id DROP NOT NULL;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE scouting_reports ALTER COLUMN player_id SET NOT NULL;'
    );
  }
};

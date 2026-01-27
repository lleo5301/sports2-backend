'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    // Allow null game_date for TBD games (e.g., future season schedules)
    await queryInterface.sequelize.query(
      'ALTER TABLE games ALTER COLUMN game_date DROP NOT NULL'
    );
  },

  async down(queryInterface, _Sequelize) {
    // Note: This will fail if any NULL game_date values exist
    await queryInterface.sequelize.query(
      'ALTER TABLE games ALTER COLUMN game_date SET NOT NULL'
    );
  }
};

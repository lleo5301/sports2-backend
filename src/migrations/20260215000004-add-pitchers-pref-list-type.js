'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_preference_lists_list_type\" ADD VALUE IF NOT EXISTS 'pitchers_pref_list';"
    );
  },

  async down(_queryInterface, _Sequelize) {
    // Cannot remove enum values in PostgreSQL without recreating the type
    // This is intentionally a no-op for safety
  }
};

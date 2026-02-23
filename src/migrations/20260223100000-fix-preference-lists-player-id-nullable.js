'use strict';

/**
 * Fix: player_id on preference_lists must be nullable.
 * Migration 20260215000006 was supposed to do this but the ALTER COLUMN
 * did not actually drop the NOT NULL constraint on production.
 * This migration uses raw SQL to ensure it takes effect.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE preference_lists ALTER COLUMN player_id DROP NOT NULL;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE preference_lists ALTER COLUMN player_id SET NOT NULL;'
    );
  }
};

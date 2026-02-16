'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add prospect_id FK
    await queryInterface.addColumn('preference_lists', 'prospect_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'prospects', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    // 2. Make player_id nullable
    await queryInterface.changeColumn('preference_lists', 'player_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'players', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    // 3. Add CHECK constraint: exactly one of player_id or prospect_id
    await queryInterface.sequelize.query(`
      ALTER TABLE preference_lists
      ADD CONSTRAINT preference_list_target CHECK (
        (player_id IS NOT NULL AND prospect_id IS NULL) OR
        (player_id IS NULL AND prospect_id IS NOT NULL)
      );
    `);

    // 4. Drop old unique index
    await queryInterface.removeIndex('preference_lists', ['player_id', 'team_id', 'list_type']);

    // 5. Create partial unique indexes
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_pref_list_player
      ON preference_lists(player_id, team_id, list_type)
      WHERE player_id IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_pref_list_prospect
      ON preference_lists(prospect_id, team_id, list_type)
      WHERE prospect_id IS NOT NULL;
    `);

    // 6. Add index on prospect_id for lookups
    await queryInterface.addIndex('preference_lists', ['prospect_id'], {
      name: 'idx_preference_lists_prospect'
    });
  },

  async down(queryInterface, _Sequelize) {
    // Remove prospect index
    await queryInterface.removeIndex('preference_lists', 'idx_preference_lists_prospect');

    // Drop partial unique indexes
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_pref_list_player;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_pref_list_prospect;');

    // Drop CHECK constraint
    await queryInterface.sequelize.query(
      'ALTER TABLE preference_lists DROP CONSTRAINT IF EXISTS preference_list_target;'
    );

    // Remove prospect_id column
    await queryInterface.removeColumn('preference_lists', 'prospect_id');

    // Restore player_id NOT NULL
    await queryInterface.changeColumn('preference_lists', 'player_id', {
      type: require('sequelize').INTEGER,
      allowNull: false,
      references: { model: 'players', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    // Recreate original unique index
    await queryInterface.addIndex('preference_lists', ['player_id', 'team_id', 'list_type'], {
      unique: true
    });
  }
};

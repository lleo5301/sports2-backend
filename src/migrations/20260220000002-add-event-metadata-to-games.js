'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('games', 'tournament_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tournaments',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('games', 'venue_name', {
      type: Sequelize.STRING(200),
      allowNull: true,
      comment: 'Stadium / field name (e.g. "Cool Today Park")'
    });

    await queryInterface.addColumn('games', 'event_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'scrimmage | regular'
    });

    await queryInterface.addColumn('games', 'is_conference', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await queryInterface.addColumn('games', 'is_neutral', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await queryInterface.addColumn('games', 'is_post_season', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await queryInterface.addIndex('games', ['tournament_id']);
    await queryInterface.addIndex('games', ['event_type']);
    await queryInterface.addIndex('games', ['is_conference']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('games', ['is_conference']);
    await queryInterface.removeIndex('games', ['event_type']);
    await queryInterface.removeIndex('games', ['tournament_id']);

    await queryInterface.removeColumn('games', 'is_post_season');
    await queryInterface.removeColumn('games', 'is_neutral');
    await queryInterface.removeColumn('games', 'is_conference');
    await queryInterface.removeColumn('games', 'event_type');
    await queryInterface.removeColumn('games', 'venue_name');
    await queryInterface.removeColumn('games', 'tournament_id');
  }
};

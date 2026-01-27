'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add bio field for player biography
    await queryInterface.addColumn('players', 'bio', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Player biography'
    });

    // Add hometown as combined location string
    await queryInterface.addColumn('players', 'hometown', {
      type: Sequelize.STRING(200),
      allowNull: true,
      comment: 'Player hometown (city, state, country)'
    });

    // Add high school name
    await queryInterface.addColumn('players', 'high_school', {
      type: Sequelize.STRING(150),
      allowNull: true,
      comment: 'High school name'
    });

    // Add high school city/state
    await queryInterface.addColumn('players', 'high_school_city', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'High school city'
    });

    await queryInterface.addColumn('players', 'high_school_state', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'High school state'
    });

    // Add previous school for transfers
    await queryInterface.addColumn('players', 'previous_school', {
      type: Sequelize.STRING(150),
      allowNull: true,
      comment: 'Previous college (for transfers)'
    });

    // Add country for international players
    await queryInterface.addColumn('players', 'country', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Country of origin'
    });

    // Add photo URL
    await queryInterface.addColumn('players', 'photo_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'Profile photo URL'
    });

    // Add social media links as JSONB
    await queryInterface.addColumn('players', 'social_links', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Social media links (twitter, instagram, etc.)'
    });

    // Add bats/throws handedness
    await queryInterface.addColumn('players', 'bats', {
      type: Sequelize.STRING(10),
      allowNull: true,
      comment: 'Batting handedness (L/R/S)'
    });

    await queryInterface.addColumn('players', 'throws', {
      type: Sequelize.STRING(10),
      allowNull: true,
      comment: 'Throwing handedness (L/R)'
    });

    // Add academic major
    await queryInterface.addColumn('players', 'major', {
      type: Sequelize.STRING(150),
      allowNull: true,
      comment: 'Academic major'
    });

    // Add experience/eligibility info
    await queryInterface.addColumn('players', 'eligibility_year', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Eligibility year (1-5)'
    });

    // Add roster notes
    await queryInterface.addColumn('players', 'roster_notes', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Additional roster notes from PrestoSports'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn('players', 'bio');
    await queryInterface.removeColumn('players', 'hometown');
    await queryInterface.removeColumn('players', 'high_school');
    await queryInterface.removeColumn('players', 'high_school_city');
    await queryInterface.removeColumn('players', 'high_school_state');
    await queryInterface.removeColumn('players', 'previous_school');
    await queryInterface.removeColumn('players', 'country');
    await queryInterface.removeColumn('players', 'photo_url');
    await queryInterface.removeColumn('players', 'social_links');
    await queryInterface.removeColumn('players', 'bats');
    await queryInterface.removeColumn('players', 'throws');
    await queryInterface.removeColumn('players', 'major');
    await queryInterface.removeColumn('players', 'eligibility_year');
    await queryInterface.removeColumn('players', 'roster_notes');
  }
};

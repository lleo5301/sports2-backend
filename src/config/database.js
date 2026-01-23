const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Use test database when NODE_ENV is test
const defaultDbName = process.env.NODE_ENV === 'test' ? 'collegiate_baseball_test' : 'collegiate_baseball';

const sequelize = new Sequelize(
  process.env.DB_NAME || defaultDbName,
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? (msg) => logger.debug('DB Query:', msg) : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  }
);

module.exports = { sequelize };

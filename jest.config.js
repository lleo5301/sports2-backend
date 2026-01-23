/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/server.js',
    '!src/config/**',
    '!src/models/**',
    '!**/node_modules/**',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['js', 'json'],
  // Run tests serially to avoid database race conditions with sync({ force: true })
  maxWorkers: 1,
  // Increase timeout for database operations
  testTimeout: 30000,
};



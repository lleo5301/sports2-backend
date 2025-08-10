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
};



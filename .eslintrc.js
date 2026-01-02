/**
 * ESLint configuration for backend Node.js/Express application
 *
 * This configuration enforces the existing code style:
 * - 2-space indentation
 * - Single quotes
 * - CommonJS module syntax
 * - Node.js and ES2021 environment
 */

const globals = require('globals');

module.exports = {
  // Environment configuration
  env: {
    node: true,
    es2021: true,
    jest: true,
    mocha: true
  },

  // Extend recommended configurations
  extends: [
    'eslint:recommended',
    'plugin:node/recommended'
  ],

  // Parser options
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'commonjs'
  },

  // Global variables
  globals: {
    ...globals.node,
    ...globals.es2021
  },

  // Plugins
  plugins: ['node'],

  // Custom rules to match existing code style
  rules: {
    // Indentation: 2 spaces
    'indent': ['error', 2, {
      'SwitchCase': 1,
      'VariableDeclarator': 'first',
      'MemberExpression': 1
    }],

    // Quotes: single quotes, allow template literals
    'quotes': ['error', 'single', {
      'avoidEscape': true,
      'allowTemplateLiterals': true
    }],

    // Semicolons: required
    'semi': ['error', 'always'],

    // Comma style
    'comma-dangle': ['error', 'never'],
    'comma-spacing': ['error', { 'before': false, 'after': true }],

    // Allow console.log (widely used in the codebase for logging)
    'no-console': 'off',

    // Allow unused vars with underscore prefix (common pattern for unused params)
    'no-unused-vars': ['error', {
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_'
    }],

    // Prefer const over let when variable is not reassigned
    'prefer-const': 'error',

    // Require === and !== instead of == and !=
    'eqeqeq': ['error', 'always'],

    // Disallow var, use let or const
    'no-var': 'error',

    // Prefer arrow callbacks
    'prefer-arrow-callback': ['error', {
      'allowNamedFunctions': true
    }],

    // Object shorthand
    'object-shorthand': ['error', 'always'],

    // Arrow function spacing
    'arrow-spacing': ['error', { 'before': true, 'after': true }],

    // Require curly braces for all control statements
    'curly': ['error', 'all'],

    // Enforce consistent brace style
    'brace-style': ['error', '1tbs', { 'allowSingleLine': false }],

    // Space before function parenthesis
    'space-before-function-paren': ['error', {
      'anonymous': 'always',
      'named': 'never',
      'asyncArrow': 'always'
    }],

    // Require space before blocks
    'space-before-blocks': 'error',

    // Keyword spacing
    'keyword-spacing': ['error', { 'before': true, 'after': true }],

    // No trailing spaces
    'no-trailing-spaces': 'error',

    // No multiple empty lines
    'no-multiple-empty-lines': ['error', { 'max': 1, 'maxEOF': 0 }],

    // End of line
    'eol-last': ['error', 'always'],

    // Node-specific rules
    'node/no-unsupported-features/es-syntax': 'off', // Allow ES2021 syntax
    'node/no-missing-require': 'error',
    'node/no-unpublished-require': ['error', {
      'allowModules': ['supertest', 'jest', 'mocha', 'chai']
    }],
    'node/no-extraneous-require': 'error',
    'node/exports-style': ['error', 'module.exports'],

    // Express/async best practices
    'require-await': 'error',
    'no-return-await': 'error',

    // Error handling
    'handle-callback-err': 'error',
    'no-throw-literal': 'error',

    // Promise best practices
    'prefer-promise-reject-errors': 'error'
  }
};

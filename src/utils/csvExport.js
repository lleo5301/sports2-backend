/**
 * CSV Export Utility
 *
 * Provides functions for exporting data to CSV format with proper escaping and formatting.
 * Handles special characters (commas, quotes, newlines) according to RFC 4180 CSV standard.
 *
 * @module utils/csvExport
 */

/**
 * Escapes a single CSV value according to RFC 4180 standard.
 * - Wraps values in quotes if they contain commas, quotes, or newlines
 * - Escapes internal quotes by doubling them
 * - Converts null/undefined to empty string
 *
 * @param {*} value - The value to escape (can be string, number, boolean, null, undefined)
 * @returns {string} The escaped CSV value
 *
 * @example
 * escapeCSVValue('John Doe')        // returns: John Doe
 * escapeCSVValue('Doe, John')       // returns: "Doe, John"
 * escapeCSVValue('He said "Hi"')    // returns: "He said ""Hi"""
 * escapeCSVValue('Line 1\nLine 2')  // returns: "Line 1\nLine 2"
 * escapeCSVValue(null)              // returns: (empty string)
 */
const escapeCSVValue = (value) => {
  // Handle null/undefined values
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to string
  const stringValue = String(value);

  // Check if value needs to be quoted (contains comma, quote, or newline)
  const needsQuoting = stringValue.includes(',') ||
                       stringValue.includes('"') ||
                       stringValue.includes('\n') ||
                       stringValue.includes('\r');

  if (needsQuoting) {
    // Escape quotes by doubling them, then wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

/**
 * Configuration object for defining CSV columns.
 *
 * @typedef {Object} ColumnConfig
 * @property {string} label - The column header label
 * @property {string} key - The object property key to extract data from
 */

/**
 * Converts an array of objects to a CSV string with configurable columns.
 * Generates a header row based on column labels and data rows based on column keys.
 *
 * @param {Array<Object>} data - Array of data objects to convert
 * @param {Array<ColumnConfig>} columns - Array of column configurations
 * @returns {string} CSV formatted string with headers and data rows
 *
 * @example
 * const data = [
 *   { firstName: 'John', lastName: 'Doe', age: 25 },
 *   { firstName: 'Jane', lastName: 'Smith', age: 30 }
 * ];
 *
 * const columns = [
 *   { label: 'First Name', key: 'firstName' },
 *   { label: 'Last Name', key: 'lastName' },
 *   { label: 'Age', key: 'age' }
 * ];
 *
 * const csv = arrayToCSV(data, columns);
 * // Returns:
 * // First Name,Last Name,Age
 * // John,Doe,25
 * // Jane,Smith,30
 */
const arrayToCSV = (data, columns) => {
  // Validation: Ensure data is an array
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array');
  }

  // Validation: Ensure columns is an array with at least one column
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Columns must be a non-empty array');
  }

  // Business logic: Generate header row from column labels
  const headers = columns.map(col => escapeCSVValue(col.label)).join(',');

  // Business logic: Generate data rows
  const rows = data.map(item => {
    return columns
      .map(col => {
        // Extract value using column key, supporting nested properties
        const value = col.key.split('.').reduce((obj, key) => {
          return obj && obj[key] !== undefined ? obj[key] : null;
        }, item);
        return escapeCSVValue(value);
      })
      .join(',');
  });

  // Combine header and data rows
  return [headers, ...rows].join('\n');
};

/**
 * Generates a CSV filename with timestamp.
 * Creates filenames in the format: {prefix}_{YYYY-MM-DD}.csv
 *
 * @param {string} prefix - The filename prefix (e.g., 'players', 'coaches')
 * @param {Date} [date=new Date()] - Optional date to use for timestamp (defaults to current date)
 * @returns {string} Filename with timestamp and .csv extension
 *
 * @example
 * generateFilename('players')
 * // Returns: players_2026-01-02.csv (using current date)
 *
 * generateFilename('coaches', new Date('2026-12-25'))
 * // Returns: coaches_2026-12-25.csv
 */
const generateFilename = (prefix, date = new Date()) => {
  // Validation: Ensure prefix is a non-empty string
  if (!prefix || typeof prefix !== 'string') {
    throw new Error('Prefix must be a non-empty string');
  }

  // Business logic: Format date as YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  return `${prefix}_${dateString}.csv`;
};

module.exports = {
  escapeCSVValue,
  arrayToCSV,
  generateFilename
};

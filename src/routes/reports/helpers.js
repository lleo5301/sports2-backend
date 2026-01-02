/**
 * @fileoverview Helper functions for report operations.
 * Provides utility functions for scouting report grade conversions and analysis.
 *
 * @module routes/reports/helpers
 */

/**
 * @description Converts letter grades to numeric values for statistical calculations.
 *              Used in scouting report analysis to calculate average grades across reports.
 *
 *              Grade scale:
 *              - A+: 97, A: 93, A-: 90
 *              - B+: 87, B: 83, B-: 80
 *              - C+: 77, C: 73, C-: 70
 *              - D+: 67, D: 63, D-: 60
 *              - F: 50
 *
 * @param {string} grade - Letter grade (e.g., 'A+', 'B-', 'F')
 * @returns {number} Numeric value (0-100 scale, 0 if grade not recognized)
 */
const gradeToNumeric = (grade) => {
  const gradeMap = {
    'A+': 97, 'A': 93, 'A-': 90,
    'B+': 87, 'B': 83, 'B-': 80,
    'C+': 77, 'C': 73, 'C-': 70,
    'D+': 67, 'D': 63, 'D-': 60,
    'F': 50
  };
  return gradeMap[grade] || 0;
};

module.exports = {
  gradeToNumeric
};

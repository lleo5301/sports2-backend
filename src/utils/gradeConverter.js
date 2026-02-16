'use strict';

const GRADE_MAP = {
  80: 'A+',
  70: 'A',
  65: 'A-',
  60: 'B+',
  55: 'B',
  50: 'B-',
  45: 'C+',
  40: 'C',
  35: 'C-',
  30: 'D+',
  25: 'D',
  20: 'F'
};

const REVERSE_GRADE_MAP = Object.fromEntries(
  Object.entries(GRADE_MAP).map(([num, letter]) => [letter, parseInt(num)])
);

const VALID_NUMERIC_GRADES = Object.keys(GRADE_MAP).map(Number).sort((a, b) => a - b);
const VALID_LETTER_GRADES = Object.values(GRADE_MAP);

const GRADE_FIELDS = [
  'overall_present', 'overall_future',
  'hitting_present', 'hitting_future',
  'bat_speed_present', 'bat_speed_future',
  'raw_power_present', 'raw_power_future',
  'game_power_present', 'game_power_future',
  'plate_discipline_present', 'plate_discipline_future',
  'pitching_present', 'pitching_future',
  'fastball_present', 'fastball_future',
  'curveball_present', 'curveball_future',
  'slider_present', 'slider_future',
  'changeup_present', 'changeup_future',
  'command_present', 'command_future',
  'fielding_present', 'fielding_future',
  'arm_strength_present', 'arm_strength_future',
  'arm_accuracy_present', 'arm_accuracy_future',
  'range_present', 'range_future',
  'hands_present', 'hands_future',
  'speed_present', 'speed_future',
  'baserunning_present', 'baserunning_future',
  'intangibles_present', 'intangibles_future',
  'work_ethic_grade', 'coachability_grade',
  'baseball_iq_present', 'baseball_iq_future',
  'overall_future_potential'
];

const toLetterGrade = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  return GRADE_MAP[value] || null;
};

const toNumericGrade = (letter) => {
  if (letter === null || letter === undefined || letter === '') {
    return null;
  }
  const result = REVERSE_GRADE_MAP[letter];
  return result !== undefined ? result : null;
};

const isValidNumericGrade = (value) => {
  return VALID_NUMERIC_GRADES.includes(value);
};

const isValidLetterGrade = (letter) => {
  return VALID_LETTER_GRADES.includes(letter);
};

const formatGradeForDisplay = (value, scale) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (scale === 'letter') {
    return toLetterGrade(value);
  }
  return value;
};

const convertReportGrades = (report, scale) => {
  if (!report) {
    return report;
  }
  const converted = { ...report };
  if (scale === 'letter') {
    for (const field of GRADE_FIELDS) {
      if (field in converted) {
        converted[field] = toLetterGrade(converted[field]);
      }
    }
  }
  return converted;
};

module.exports = {
  GRADE_MAP,
  REVERSE_GRADE_MAP,
  VALID_NUMERIC_GRADES,
  VALID_LETTER_GRADES,
  GRADE_FIELDS,
  toLetterGrade,
  toNumericGrade,
  isValidNumericGrade,
  isValidLetterGrade,
  formatGradeForDisplay,
  convertReportGrades
};

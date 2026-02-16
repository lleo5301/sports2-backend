'use strict';

const {
  GRADE_MAP,
  VALID_NUMERIC_GRADES,
  toLetterGrade,
  toNumericGrade,
  isValidNumericGrade,
  isValidLetterGrade,
  formatGradeForDisplay,
  convertReportGrades
} = require('../gradeConverter');

describe('gradeConverter', () => {
  describe('GRADE_MAP', () => {
    it('should map all 12 grade levels', () => {
      expect(Object.keys(GRADE_MAP)).toHaveLength(12);
    });

    it('should have correct boundary values', () => {
      expect(GRADE_MAP[80]).toBe('A+');
      expect(GRADE_MAP[20]).toBe('F');
      expect(GRADE_MAP[50]).toBe('B-');
    });
  });

  describe('VALID_NUMERIC_GRADES', () => {
    it('should contain all valid grade values', () => {
      expect(VALID_NUMERIC_GRADES).toEqual([20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80]);
    });
  });

  describe('toLetterGrade', () => {
    it('should convert all numeric grades to letters', () => {
      expect(toLetterGrade(80)).toBe('A+');
      expect(toLetterGrade(70)).toBe('A');
      expect(toLetterGrade(65)).toBe('A-');
      expect(toLetterGrade(60)).toBe('B+');
      expect(toLetterGrade(55)).toBe('B');
      expect(toLetterGrade(50)).toBe('B-');
      expect(toLetterGrade(45)).toBe('C+');
      expect(toLetterGrade(40)).toBe('C');
      expect(toLetterGrade(35)).toBe('C-');
      expect(toLetterGrade(30)).toBe('D+');
      expect(toLetterGrade(25)).toBe('D');
      expect(toLetterGrade(20)).toBe('F');
    });

    it('should return null for null input', () => {
      expect(toLetterGrade(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(toLetterGrade(undefined)).toBeNull();
    });

    it('should return null for invalid numeric values', () => {
      expect(toLetterGrade(15)).toBeNull();
      expect(toLetterGrade(90)).toBeNull();
      expect(toLetterGrade(42)).toBeNull();
    });
  });

  describe('toNumericGrade', () => {
    it('should convert all letter grades to numbers', () => {
      expect(toNumericGrade('A+')).toBe(80);
      expect(toNumericGrade('A')).toBe(70);
      expect(toNumericGrade('A-')).toBe(65);
      expect(toNumericGrade('B+')).toBe(60);
      expect(toNumericGrade('B')).toBe(55);
      expect(toNumericGrade('B-')).toBe(50);
      expect(toNumericGrade('C+')).toBe(45);
      expect(toNumericGrade('C')).toBe(40);
      expect(toNumericGrade('C-')).toBe(35);
      expect(toNumericGrade('D+')).toBe(30);
      expect(toNumericGrade('D')).toBe(25);
      expect(toNumericGrade('F')).toBe(20);
    });

    it('should return null for null input', () => {
      expect(toNumericGrade(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(toNumericGrade(undefined)).toBeNull();
    });

    it('should return null for invalid letter grades', () => {
      expect(toNumericGrade('E')).toBeNull();
      expect(toNumericGrade('A++')).toBeNull();
      expect(toNumericGrade('')).toBeNull();
    });
  });

  describe('isValidNumericGrade', () => {
    it('should return true for valid grades', () => {
      expect(isValidNumericGrade(20)).toBe(true);
      expect(isValidNumericGrade(50)).toBe(true);
      expect(isValidNumericGrade(80)).toBe(true);
    });

    it('should return false for invalid grades', () => {
      expect(isValidNumericGrade(15)).toBe(false);
      expect(isValidNumericGrade(42)).toBe(false);
      expect(isValidNumericGrade(null)).toBe(false);
    });
  });

  describe('isValidLetterGrade', () => {
    it('should return true for valid grades', () => {
      expect(isValidLetterGrade('A+')).toBe(true);
      expect(isValidLetterGrade('C')).toBe(true);
      expect(isValidLetterGrade('F')).toBe(true);
    });

    it('should return false for invalid grades', () => {
      expect(isValidLetterGrade('E')).toBe(false);
      expect(isValidLetterGrade('A++')).toBe(false);
      expect(isValidLetterGrade(null)).toBe(false);
    });
  });

  describe('formatGradeForDisplay', () => {
    it('should return letter when scale is letter', () => {
      expect(formatGradeForDisplay(80, 'letter')).toBe('A+');
      expect(formatGradeForDisplay(50, 'letter')).toBe('B-');
    });

    it('should return number when scale is 20-80', () => {
      expect(formatGradeForDisplay(80, '20-80')).toBe(80);
      expect(formatGradeForDisplay(50, '20-80')).toBe(50);
    });

    it('should return null for null input regardless of scale', () => {
      expect(formatGradeForDisplay(null, 'letter')).toBeNull();
      expect(formatGradeForDisplay(null, '20-80')).toBeNull();
    });
  });

  describe('convertReportGrades', () => {
    const sampleReport = {
      id: 1,
      overall_present: 60,
      overall_future: 70,
      hitting_present: 50,
      hitting_future: null,
      report_date: '2026-02-15',
      opponent: 'Test U'
    };

    it('should convert grade fields to letters when scale is letter', () => {
      const result = convertReportGrades(sampleReport, 'letter');
      expect(result.overall_present).toBe('B+');
      expect(result.overall_future).toBe('A');
      expect(result.hitting_present).toBe('B-');
      expect(result.hitting_future).toBeNull();
    });

    it('should leave grade fields as numbers when scale is 20-80', () => {
      const result = convertReportGrades(sampleReport, '20-80');
      expect(result.overall_present).toBe(60);
      expect(result.overall_future).toBe(70);
    });

    it('should preserve non-grade fields', () => {
      const result = convertReportGrades(sampleReport, 'letter');
      expect(result.id).toBe(1);
      expect(result.report_date).toBe('2026-02-15');
      expect(result.opponent).toBe('Test U');
    });
  });
});

'use strict';

const VALID_GRADES = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
const QUALITY_ENUMS = ['Well Below Average', 'Below Average', 'Average', 'Above Average', 'Well Above Average'];
const PROJECTION_ENUMS = ['Positive Projection', 'Neutral Projection', 'Negative Projection'];
const POSITION_CODES = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'COF'];

/**
 * Validates a single grade value (20-80 in increments of 5).
 * Returns an error string or null if valid.
 */
const validateGrade = (value, path) => {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || !VALID_GRADES.includes(value)) {
    return `${path} must be an integer from 20-80 in increments of 5, got ${value}`;
  }
  return null;
};

/**
 * Validates a present/future grade pair object like { present: 55, future: 60, description: "..." }.
 */
const validateGradePair = (obj, path) => {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== 'object') return [`${path} must be an object`];
  const errors = [];
  const e1 = validateGrade(obj.present, `${path}.present`);
  if (e1) errors.push(e1);
  const e2 = validateGrade(obj.future, `${path}.future`);
  if (e2) errors.push(e2);
  if (obj.description !== undefined && obj.description !== null && typeof obj.description !== 'string') {
    errors.push(`${path}.description must be a string`);
  }
  return errors;
};

/**
 * Validates an enum string value against allowed values.
 */
const validateEnum = (value, allowed, path) => {
  if (value === null || value === undefined) return null;
  if (!allowed.includes(value)) {
    return `${path} must be one of [${allowed.join(', ')}], got "${value}"`;
  }
  return null;
};

/**
 * Validates the full tool_grades JSONB object.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
const validateToolGrades = (toolGrades) => {
  if (toolGrades === null || toolGrades === undefined) return { valid: true };
  if (typeof toolGrades !== 'object' || Array.isArray(toolGrades)) {
    return { valid: false, errors: ['tool_grades must be an object'] };
  }

  const errors = [];

  // body
  if (toolGrades.body) {
    const b = toolGrades.body;
    const e = validateGrade(b.grade, 'body.grade');
    if (e) errors.push(e);
    const pe = validateEnum(b.projection, PROJECTION_ENUMS, 'body.projection');
    if (pe) errors.push(pe);
  }

  // athleticism
  if (toolGrades.athleticism) {
    const e = validateGrade(toolGrades.athleticism.grade, 'athleticism.grade');
    if (e) errors.push(e);
  }

  // bat
  if (toolGrades.bat) {
    const bat = toolGrades.bat;
    errors.push(...validateGradePair(bat.hit, 'bat.hit'));
    errors.push(...validateGradePair(bat.power, 'bat.power'));
    errors.push(...validateGradePair(bat.raw_power, 'bat.raw_power'));
    errors.push(...validateGradePair(bat.bat_speed, 'bat.bat_speed'));
    const ce = validateEnum(bat.contact, QUALITY_ENUMS, 'bat.contact');
    if (ce) errors.push(ce);
    const se = validateEnum(bat.swing_decisions, QUALITY_ENUMS, 'bat.swing_decisions');
    if (se) errors.push(se);
    const qe = validateEnum(bat.contact_quality, QUALITY_ENUMS, 'bat.contact_quality');
    if (qe) errors.push(qe);
  }

  // field
  if (toolGrades.field) {
    const f = toolGrades.field;
    errors.push(...validateGradePair(f.arm_strength, 'field.arm_strength'));
    errors.push(...validateGradePair(f.arm_accuracy, 'field.arm_accuracy'));
    const pe = validateEnum(f.current_position, POSITION_CODES, 'field.current_position');
    if (pe) errors.push(pe);
    const de = validateGrade(f.defense_present, 'field.defense_present');
    if (de) errors.push(de);
    const fg = validateGrade(f.fielding_grade, 'field.fielding_grade');
    if (fg) errors.push(fg);
    if (Array.isArray(f.future_positions)) {
      f.future_positions.forEach((fp, i) => {
        const fpe = validateEnum(fp.position, POSITION_CODES, `field.future_positions[${i}].position`);
        if (fpe) errors.push(fpe);
        const fge = validateGrade(fp.grade, `field.future_positions[${i}].grade`);
        if (fge) errors.push(fge);
      });
    }
  }

  // run
  if (toolGrades.run) {
    const r = toolGrades.run;
    if (r.speed) {
      const e = validateGrade(r.speed.grade, 'run.speed.grade');
      if (e) errors.push(e);
    }
    if (r.baserunning) {
      const e = validateGrade(r.baserunning.grade, 'run.baserunning.grade');
      if (e) errors.push(e);
    }
    if (r.instincts) {
      const e = validateGrade(r.instincts.grade, 'run.instincts.grade');
      if (e) errors.push(e);
    }
    if (r.compete) {
      const e = validateGrade(r.compete.grade, 'run.compete.grade');
      if (e) errors.push(e);
    }
  }

  // pitching (documented but Phase 1 — still validate if provided)
  if (toolGrades.pitching) {
    const p = toolGrades.pitching;
    errors.push(...validateGradePair(p.fastball, 'pitching.fastball'));
    errors.push(...validateGradePair(p.slider, 'pitching.slider'));
    errors.push(...validateGradePair(p.curveball, 'pitching.curveball'));
    errors.push(...validateGradePair(p.changeup, 'pitching.changeup'));
    const cmd = validateGrade(p.command, 'pitching.command');
    if (cmd) errors.push(cmd);
    const ctrl = validateGrade(p.control, 'pitching.control');
    if (ctrl) errors.push(ctrl);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
};

module.exports = { validateToolGrades, VALID_GRADES, QUALITY_ENUMS, PROJECTION_ENUMS, POSITION_CODES };

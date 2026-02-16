# Scouting System Redesign — TDD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a separate prospects system, dual-scale scouting reports with present/future grades, prospect media uploads, and pitchers preference list.

**Architecture:** New `Prospect` and `ProspectMedia` models with dedicated routes. Existing `ScoutingReport` and `PreferenceList` gain polymorphic FKs (`player_id` OR `prospect_id`). A grade converter utility handles 20-80 ↔ letter translation. All grades stored as integers internally.

**Tech Stack:** Node.js 24, Express 4.x, Sequelize ORM, PostgreSQL 15, Jest + Supertest for tests.

**Design Doc:** `docs/plans/2026-02-15-scouting-system-design.md`

---

## Task 1: Grade Converter Utility

**Files:**
- Create: `src/utils/gradeConverter.js`
- Create: `src/utils/__tests__/gradeConverter.test.js`

### Step 1: Write the failing tests

```javascript
// src/utils/__tests__/gradeConverter.test.js
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
```

### Step 2: Run test to verify it fails

Run: `npm test -- --testPathPattern="gradeConverter"`
Expected: FAIL — `Cannot find module '../gradeConverter'`

### Step 3: Write the implementation

```javascript
// src/utils/gradeConverter.js
'use strict';

/**
 * Grade conversion utility for scouting reports.
 * Converts between the 20-80 numeric scale (industry standard)
 * and letter grades (A+ to F).
 *
 * All grades are stored as integers (20-80) in the database.
 * The display format is determined by team settings.
 */

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

// Fields in scouting_reports that contain grade values (present/future pairs)
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
```

### Step 4: Run test to verify it passes

Run: `npm test -- --testPathPattern="gradeConverter"`
Expected: All tests PASS

### Step 5: Commit

```bash
git add src/utils/gradeConverter.js src/utils/__tests__/gradeConverter.test.js
git commit -m "feat: add grade converter utility for 20-80 and letter scale conversion"
```

---

## Task 2: Create Prospects Migration and Model

**Files:**
- Create: `src/migrations/20260215000001-create-prospects.js`
- Create: `src/models/Prospect.js`
- Modify: `src/models/index.js` — add Prospect import and associations

### Step 1: Write the migration

```javascript
// src/migrations/20260215000001-create-prospects.js
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('prospects', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      // Identity
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      photo_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      // School Info
      school_type: {
        type: Sequelize.ENUM('HS', 'JUCO', 'D1', 'D2', 'D3', 'NAIA', 'Independent'),
        allowNull: false,
        defaultValue: 'HS'
      },
      school_name: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      state: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      graduation_year: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      class_year: {
        type: Sequelize.ENUM('FR', 'SO', 'JR', 'SR', 'GR'),
        allowNull: true
      },
      // Baseball Profile
      primary_position: {
        type: Sequelize.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL'),
        allowNull: false
      },
      secondary_position: {
        type: Sequelize.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL'),
        allowNull: true
      },
      bats: {
        type: Sequelize.ENUM('L', 'R', 'S'),
        allowNull: true
      },
      throws: {
        type: Sequelize.ENUM('L', 'R'),
        allowNull: true
      },
      height: {
        type: Sequelize.STRING(10),
        allowNull: true
      },
      weight: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      // Measurables
      sixty_yard_dash: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: true
      },
      home_to_first: {
        type: Sequelize.DECIMAL(3, 1),
        allowNull: true
      },
      fastball_velocity: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      exit_velocity: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      pop_time: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      // Academic
      gpa: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      sat_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      act_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      academic_eligibility: {
        type: Sequelize.ENUM('eligible', 'pending', 'ineligible', 'unknown'),
        allowNull: true,
        defaultValue: 'unknown'
      },
      // Recruiting Status
      status: {
        type: Sequelize.ENUM('identified', 'evaluating', 'contacted', 'visiting', 'offered', 'committed', 'signed', 'passed'),
        allowNull: false,
        defaultValue: 'identified'
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // External Links
      video_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      social_links: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      external_profile_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('prospects', ['team_id'], {
      name: 'idx_prospects_team_id'
    });
    await queryInterface.addIndex('prospects', ['team_id', 'status'], {
      name: 'idx_prospects_status'
    });
    await queryInterface.addIndex('prospects', ['team_id', 'primary_position'], {
      name: 'idx_prospects_position'
    });
    await queryInterface.addIndex('prospects', ['team_id', 'school_type'], {
      name: 'idx_prospects_school_type'
    });
    await queryInterface.addIndex('prospects', ['team_id', 'last_name', 'first_name'], {
      name: 'idx_prospects_name'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('prospects');
  }
};
```

### Step 2: Write the model

```javascript
// src/models/Prospect.js
'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Prospect = sequelize.define('Prospect', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'teams', key: 'id' }
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { len: [1, 100] }
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { len: [1, 100] }
  },
  email: { type: DataTypes.STRING(255), allowNull: true },
  phone: { type: DataTypes.STRING(20), allowNull: true },
  photo_url: { type: DataTypes.STRING(500), allowNull: true },
  school_type: {
    type: DataTypes.ENUM('HS', 'JUCO', 'D1', 'D2', 'D3', 'NAIA', 'Independent'),
    allowNull: false,
    defaultValue: 'HS'
  },
  school_name: { type: DataTypes.STRING(200), allowNull: true },
  city: { type: DataTypes.STRING(100), allowNull: true },
  state: { type: DataTypes.STRING(50), allowNull: true },
  graduation_year: { type: DataTypes.INTEGER, allowNull: true },
  class_year: {
    type: DataTypes.ENUM('FR', 'SO', 'JR', 'SR', 'GR'),
    allowNull: true
  },
  primary_position: {
    type: DataTypes.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL'),
    allowNull: false
  },
  secondary_position: {
    type: DataTypes.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL'),
    allowNull: true
  },
  bats: { type: DataTypes.ENUM('L', 'R', 'S'), allowNull: true },
  throws: { type: DataTypes.ENUM('L', 'R'), allowNull: true },
  height: { type: DataTypes.STRING(10), allowNull: true },
  weight: { type: DataTypes.INTEGER, allowNull: true },
  sixty_yard_dash: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
  home_to_first: { type: DataTypes.DECIMAL(3, 1), allowNull: true },
  fastball_velocity: { type: DataTypes.INTEGER, allowNull: true },
  exit_velocity: { type: DataTypes.INTEGER, allowNull: true },
  pop_time: { type: DataTypes.DECIMAL(3, 2), allowNull: true },
  gpa: { type: DataTypes.DECIMAL(3, 2), allowNull: true },
  sat_score: { type: DataTypes.INTEGER, allowNull: true },
  act_score: { type: DataTypes.INTEGER, allowNull: true },
  academic_eligibility: {
    type: DataTypes.ENUM('eligible', 'pending', 'ineligible', 'unknown'),
    allowNull: true,
    defaultValue: 'unknown'
  },
  status: {
    type: DataTypes.ENUM('identified', 'evaluating', 'contacted', 'visiting', 'offered', 'committed', 'signed', 'passed'),
    allowNull: false,
    defaultValue: 'identified'
  },
  source: { type: DataTypes.STRING(100), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  video_url: { type: DataTypes.STRING(500), allowNull: true },
  social_links: { type: DataTypes.JSONB, allowNull: true },
  external_profile_url: { type: DataTypes.STRING(500), allowNull: true }
}, {
  tableName: 'prospects'
});

module.exports = Prospect;
```

### Step 3: Add associations to `src/models/index.js`

Add after the PlayerVideo associations block (around line 259):

```javascript
// Prospect associations
const Prospect = require('./Prospect');

Prospect.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Prospect, { foreignKey: 'team_id' });

Prospect.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(Prospect, { foreignKey: 'created_by' });
```

And add `Prospect` to the `module.exports` object.

### Step 4: Run migration

Run: `docker exec sports2_backend npm run db:migrate`
Expected: `20260215000001-create-prospects: migrated`

### Step 5: Commit

```bash
git add src/migrations/20260215000001-create-prospects.js src/models/Prospect.js src/models/index.js
git commit -m "feat: add Prospect model and migration for scouting targets"
```

---

## Task 3: Create Prospect Media Migration and Model

**Files:**
- Create: `src/migrations/20260215000002-create-prospect-media.js`
- Create: `src/models/ProspectMedia.js`
- Modify: `src/models/index.js` — add ProspectMedia import and associations

### Step 1: Write the migration

```javascript
// src/migrations/20260215000002-create-prospect-media.js
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('prospect_media', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      prospect_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'prospects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      uploaded_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      media_type: {
        type: Sequelize.ENUM('video', 'photo', 'document'),
        allowNull: false
      },
      file_path: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_primary_photo: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      sort_order: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('prospect_media', ['prospect_id'], {
      name: 'idx_prospect_media_prospect'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('prospect_media');
  }
};
```

### Step 2: Write the model and add associations

Create `src/models/ProspectMedia.js` following the same pattern as `Prospect.js`.

Add to `src/models/index.js`:

```javascript
const ProspectMedia = require('./ProspectMedia');

ProspectMedia.belongsTo(Prospect, { foreignKey: 'prospect_id' });
Prospect.hasMany(ProspectMedia, { foreignKey: 'prospect_id', as: 'media' });

ProspectMedia.belongsTo(User, { foreignKey: 'uploaded_by', as: 'UploadedBy' });
User.hasMany(ProspectMedia, { foreignKey: 'uploaded_by' });
```

Add `ProspectMedia` to `module.exports`.

### Step 3: Run migration

Run: `docker exec sports2_backend npm run db:migrate`
Expected: `20260215000002-create-prospect-media: migrated`

### Step 4: Commit

```bash
git add src/migrations/20260215000002-create-prospect-media.js src/models/ProspectMedia.js src/models/index.js
git commit -m "feat: add ProspectMedia model and migration for prospect uploads"
```

---

## Task 4: Add Team Scouting Grade Scale Setting

**Files:**
- Create: `src/migrations/20260215000003-add-scouting-grade-scale-to-teams.js`
- Modify: `src/models/Team.js` — add `scouting_grade_scale` field

### Step 1: Write the migration

```javascript
// src/migrations/20260215000003-add-scouting-grade-scale-to-teams.js
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('teams', 'scouting_grade_scale', {
      type: Sequelize.ENUM('20-80', 'letter'),
      allowNull: false,
      defaultValue: 'letter'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn('teams', 'scouting_grade_scale');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_teams_scouting_grade_scale";');
  }
};
```

### Step 2: Add field to Team model, run migration, commit

Run: `docker exec sports2_backend npm run db:migrate`

```bash
git add src/migrations/20260215000003-add-scouting-grade-scale-to-teams.js src/models/Team.js
git commit -m "feat: add scouting_grade_scale setting to teams"
```

---

## Task 5: Add Pitchers Pref List Type

**Files:**
- Create: `src/migrations/20260215000004-add-pitchers-pref-list-type.js`
- Modify: `src/models/PreferenceList.js` — add `pitchers_pref_list` to enum

### Step 1: Write the migration

```javascript
// src/migrations/20260215000004-add-pitchers-pref-list-type.js
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_preference_lists_list_type\" ADD VALUE IF NOT EXISTS 'pitchers_pref_list';"
    );
  },

  async down(_queryInterface, _Sequelize) {
    // Cannot remove enum values in PostgreSQL without recreating the type
    // This is intentionally a no-op for safety
  }
};
```

### Step 2: Update model, run migration, commit

Update `src/models/PreferenceList.js` line 27 — add `'pitchers_pref_list'` to the ENUM array.

Run: `docker exec sports2_backend npm run db:migrate`

```bash
git add src/migrations/20260215000004-add-pitchers-pref-list-type.js src/models/PreferenceList.js
git commit -m "feat: add pitchers_pref_list type to preference lists"
```

---

## Task 6: Restructure Scouting Reports (Migration + Model)

**Files:**
- Create: `src/migrations/20260215000005-restructure-scouting-reports.js`
- Modify: `src/models/ScoutingReport.js` — replace ENUM grades with INTEGER, add prospect_id

This is the largest migration. It adds ~50 new columns to `scouting_reports`, makes `player_id` nullable, and adds the `prospect_id` FK.

### Step 1: Write the migration

The migration should:
1. Add `prospect_id` FK column (nullable)
2. Make `player_id` nullable
3. Add all `*_present` and `*_future` INTEGER columns with CHECK constraints
4. Add `event_type`, `mlb_comparison`, `overall_future_potential`, `sixty_yard_dash` columns
5. **Do NOT drop old columns yet** — keep for backward compatibility during transition

See design doc section 3 for the full column list.

### Step 2: Update ScoutingReport model

Replace ENUM fields with INTEGER fields. Add `prospect_id`. Keep old fields temporarily mapped but deprecated.

### Step 3: Add prospect association to index.js

```javascript
ScoutingReport.belongsTo(Prospect, { foreignKey: 'prospect_id' });
Prospect.hasMany(ScoutingReport, { foreignKey: 'prospect_id' });
```

### Step 4: Run migration and commit

Run: `docker exec sports2_backend npm run db:migrate`

```bash
git add src/migrations/20260215000005-restructure-scouting-reports.js src/models/ScoutingReport.js src/models/index.js
git commit -m "feat: restructure scouting reports with dual grades and prospect support"
```

---

## Task 7: Update Preference Lists (Polymorphic FK)

**Files:**
- Create: `src/migrations/20260215000006-update-preference-lists-polymorphic.js`
- Modify: `src/models/PreferenceList.js` — add `prospect_id`, make `player_id` nullable

### Step 1: Write the migration

The migration should:
1. Add `prospect_id` FK (nullable, references prospects)
2. Make `player_id` nullable
3. Drop the old unique index on `(player_id, team_id, list_type)`
4. Create two partial unique indexes (one for player, one for prospect)

### Step 2: Update model and associations

Add to `src/models/index.js`:
```javascript
PreferenceList.belongsTo(Prospect, { foreignKey: 'prospect_id' });
Prospect.hasMany(PreferenceList, { foreignKey: 'prospect_id' });
```

### Step 3: Run migration and commit

```bash
git add src/migrations/20260215000006-update-preference-lists-polymorphic.js src/models/PreferenceList.js src/models/index.js
git commit -m "feat: add prospect_id to preference lists with polymorphic FK"
```

---

## Task 8: Prospects CRUD Routes + Tests

**Files:**
- Create: `src/routes/prospects.js`
- Create: `src/routes/__tests__/prospects.test.js`
- Modify: `src/server.js` — mount prospects route

### Step 1: Write failing integration tests

Test file: `src/routes/__tests__/prospects.test.js`

Follow the standard test setup pattern from CLAUDE.md:

```javascript
const { sequelize, User, Team, Prospect } = require('../../models');
const app = require('../../server');
const request = require('supertest');

let authToken, team, user, csrfToken, cookies;

beforeAll(async () => {
  await sequelize.sync({ force: true });
  // Create team, user, get auth token + CSRF
});

afterAll(async () => {
  await sequelize.close();
});
```

Tests to write:
1. `POST /api/v1/prospects` — should create a prospect with required fields
2. `POST /api/v1/prospects` — should fail without first_name
3. `POST /api/v1/prospects` — should fail without primary_position
4. `GET /api/v1/prospects` — should list prospects for team
5. `GET /api/v1/prospects` — should filter by school_type
6. `GET /api/v1/prospects` — should filter by primary_position
7. `GET /api/v1/prospects` — should filter by status
8. `GET /api/v1/prospects` — should search by name
9. `GET /api/v1/prospects` — should paginate results
10. `GET /api/v1/prospects/:id` — should get prospect with associations
11. `GET /api/v1/prospects/:id` — should return 404 for wrong team
12. `PUT /api/v1/prospects/:id` — should update prospect
13. `DELETE /api/v1/prospects/:id` — should delete prospect and cascade

### Step 2: Run tests to verify they fail

Run: `npm test -- --testPathPattern="prospects"`
Expected: FAIL — routes not implemented yet

### Step 3: Implement the route

Create `src/routes/prospects.js` following the patterns in `src/routes/recruits.js`:
- `router.use(protect)` at the top
- Express-validator for all inputs
- `team_id: req.user.team_id` on all queries
- Standard `{ success, data, pagination }` response format

### Step 4: Mount the route in server.js

```javascript
const prospectRoutes = require('./routes/prospects');
app.use('/api/v1/prospects', prospectRoutes);
```

### Step 5: Run tests to verify they pass

Run: `npm test -- --testPathPattern="prospects"`
Expected: All tests PASS

### Step 6: Commit

```bash
git add src/routes/prospects.js src/routes/__tests__/prospects.test.js src/server.js
git commit -m "feat: add prospects CRUD API with full test coverage"
```

---

## Task 9: Prospect Media Upload Routes + Tests

**Files:**
- Create: `src/routes/__tests__/prospect-media.test.js`
- Modify: `src/routes/prospects.js` — add media endpoints

### Step 1: Write failing tests

Tests to write:
1. `POST /api/v1/prospects/:id/media` — upload a file (multipart)
2. `POST /api/v1/prospects/:id/media` — add external URL
3. `POST /api/v1/prospects/:id/media` — should fail for non-existent prospect
4. `DELETE /api/v1/prospects/:id/media/:mediaId` — should delete media
5. `DELETE /api/v1/prospects/:id/media/:mediaId` — should return 404 for wrong team

### Step 2: Implement media endpoints in prospects.js

Use `multer` for file uploads (same pattern as player video upload in `src/routes/players.js`).
Upload path: `./uploads/prospects/`

### Step 3: Run tests, commit

```bash
git add src/routes/prospects.js src/routes/__tests__/prospect-media.test.js
git commit -m "feat: add prospect media upload and delete endpoints"
```

---

## Task 10: Updated Scouting Report Routes + Tests

**Files:**
- Create: `src/routes/__tests__/scouting-reports-v2.test.js`
- Modify: `src/routes/reports/scouting.js` — accept prospect_id, use new grade fields

### Step 1: Write failing tests

Tests to write:
1. `POST /api/v1/prospects/:id/scouting-reports` — create report for prospect with numeric grades
2. `POST /api/v1/prospects/:id/scouting-reports` — create report with letter grades (auto-convert)
3. `GET /api/v1/prospects/:id/scouting-reports` — list reports for a prospect
4. `GET /api/v1/prospects/:id/scouting-reports` — grades returned in team's display scale
5. `PUT /api/v1/prospects/:id/scouting-reports/:id` — update a report
6. `POST /api/v1/reports/scouting` — existing player_id flow still works

### Step 2: Update scouting route

- Accept `prospect_id` in POST body (mutually exclusive with `player_id`)
- Accept grades as integers (20-80) or letters — convert letters to integers on input
- Return grades in team's `scouting_grade_scale` format using `convertReportGrades()`
- Add prospect-scoped routes in `src/routes/prospects.js`

### Step 3: Run tests, commit

```bash
git add src/routes/reports/scouting.js src/routes/prospects.js src/routes/__tests__/scouting-reports-v2.test.js
git commit -m "feat: update scouting reports with dual grades, prospect support, and grade scale conversion"
```

---

## Task 11: Updated Recruiting Board and Preference Lists + Tests

**Files:**
- Create: `src/routes/__tests__/preference-lists-v2.test.js`
- Modify: `src/routes/recruits.js` — update recruiting board to query prospects, accept prospect_id in pref lists

### Step 1: Write failing tests

Tests to write:
1. `GET /api/v1/recruits` — should return prospects (not players)
2. `GET /api/v1/recruits` — should include all positions (no P/DH exclusion)
3. `POST /api/v1/recruits/preference-lists` — should accept prospect_id
4. `POST /api/v1/recruits/preference-lists` — should reject if both player_id and prospect_id provided
5. `POST /api/v1/recruits/preference-lists` — should reject if neither player_id nor prospect_id provided
6. `POST /api/v1/recruits/preference-lists` — should accept `pitchers_pref_list` list_type
7. `GET /api/v1/recruits/preference-lists` — should return entries with Prospect association

### Step 2: Update recruits route

- `GET /api/v1/recruits` — change to query `Prospect` instead of `Player`, remove P/DH exclusion
- `POST /api/v1/recruits/preference-lists` — accept `prospect_id` OR `player_id` (validate exactly one)
- `GET /api/v1/recruits/preference-lists` — include `Prospect` association alongside `Player`
- Update express-validator to accept `pitchers_pref_list` in `list_type`

### Step 3: Run tests, commit

```bash
git add src/routes/recruits.js src/routes/__tests__/preference-lists-v2.test.js
git commit -m "feat: update recruiting board to use prospects and add pitchers pref list"
```

---

## Task 12: Lint, Full Test Suite, Final Commit

### Step 1: Run linter

Run: `npm run lint`
Expected: 0 errors (warnings acceptable)

### Step 2: Run full test suite

Run: `npm test`
Expected: All tests pass

### Step 3: Run migrations in Docker

Run: `docker exec sports2_backend npm run db:migrate`
Expected: All 6 new migrations run successfully

### Step 4: Smoke test API

```bash
# Get CSRF + login (use heredoc for password with !)
curl -s http://localhost:5000/api/v1/auth/csrf-token -c /tmp/sports2_cookies.txt
# Login...
# Create a prospect
# Add to preference list
# Create scouting report for prospect
```

### Step 5: Final commit if any fixes

```bash
git add -A
git commit -m "chore: lint fixes and test cleanup for scouting system"
```

---

## Summary: Task Execution Order

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Grade converter utility (pure logic, no DB) | None |
| 2 | Prospects migration + model | None |
| 3 | Prospect media migration + model | Task 2 |
| 4 | Team grade scale setting | None |
| 5 | Pitchers pref list type | None |
| 6 | Scouting report restructure | Task 2 |
| 7 | Preference list polymorphic FK | Task 2 |
| 8 | Prospects CRUD routes + tests | Tasks 2, 3 |
| 9 | Prospect media routes + tests | Task 8 |
| 10 | Updated scouting report routes + tests | Tasks 1, 4, 6 |
| 11 | Updated recruits/pref list routes + tests | Tasks 2, 5, 7 |
| 12 | Lint, full test suite, smoke test | All |

**Parallelizable groups:**
- Tasks 1, 2, 4, 5 can run in parallel (no dependencies)
- Tasks 3, 6, 7 can run in parallel (all depend only on Task 2)
- Tasks 8, 10, 11 can run in parallel (different route files)

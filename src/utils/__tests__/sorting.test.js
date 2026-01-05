const {
  ALLOWED_SORT_COLUMNS,
  DEFAULT_SORT_CONFIG,
  VALID_SORT_DIRECTIONS,
  isValidSortColumn,
  isValidSortDirection,
  validateSortParams,
  normalizeSortDirection,
  getAllowedSortColumns,
  getDefaultSortConfig,
  buildOrderClause,
  createOrderByValidator,
  createSortValidators
} = require('../sorting');

describe('sorting utility', () => {
  describe('constants', () => {
    describe('ALLOWED_SORT_COLUMNS', () => {
      it('should have allowed columns for players', () => {
        expect(ALLOWED_SORT_COLUMNS.players).toBeDefined();
        expect(ALLOWED_SORT_COLUMNS.players).toContain('first_name');
        expect(ALLOWED_SORT_COLUMNS.players).toContain('last_name');
        expect(ALLOWED_SORT_COLUMNS.players).toContain('position');
        expect(ALLOWED_SORT_COLUMNS.players).toContain('created_at');
      });

      it('should have allowed columns for coaches', () => {
        expect(ALLOWED_SORT_COLUMNS.coaches).toBeDefined();
        expect(ALLOWED_SORT_COLUMNS.coaches).toContain('first_name');
        expect(ALLOWED_SORT_COLUMNS.coaches).toContain('school_name');
        expect(ALLOWED_SORT_COLUMNS.coaches).toContain('created_at');
      });

      it('should have allowed columns for games', () => {
        expect(ALLOWED_SORT_COLUMNS.games).toBeDefined();
        expect(ALLOWED_SORT_COLUMNS.games).toContain('game_date');
        expect(ALLOWED_SORT_COLUMNS.games).toContain('opponent');
        expect(ALLOWED_SORT_COLUMNS.games).toContain('created_at');
      });

      it('should have allowed columns for vendors', () => {
        expect(ALLOWED_SORT_COLUMNS.vendors).toBeDefined();
        expect(ALLOWED_SORT_COLUMNS.vendors).toContain('company_name');
        expect(ALLOWED_SORT_COLUMNS.vendors).toContain('contact_person');
        expect(ALLOWED_SORT_COLUMNS.vendors).toContain('created_at');
      });

      it('should have all entity types defined', () => {
        expect(Object.keys(ALLOWED_SORT_COLUMNS)).toEqual(
          expect.arrayContaining(['players', 'coaches', 'games', 'vendors'])
        );
      });
    });

    describe('DEFAULT_SORT_CONFIG', () => {
      it('should have defaults for players', () => {
        expect(DEFAULT_SORT_CONFIG.players).toEqual({
          orderBy: 'created_at',
          sortDirection: 'DESC'
        });
      });

      it('should have defaults for coaches', () => {
        expect(DEFAULT_SORT_CONFIG.coaches).toEqual({
          orderBy: 'created_at',
          sortDirection: 'DESC'
        });
      });

      it('should have defaults for games with game_date', () => {
        expect(DEFAULT_SORT_CONFIG.games).toEqual({
          orderBy: 'game_date',
          sortDirection: 'DESC'
        });
      });

      it('should have defaults for vendors', () => {
        expect(DEFAULT_SORT_CONFIG.vendors).toEqual({
          orderBy: 'created_at',
          sortDirection: 'DESC'
        });
      });
    });

    describe('VALID_SORT_DIRECTIONS', () => {
      it('should contain ASC and DESC', () => {
        expect(VALID_SORT_DIRECTIONS).toEqual(['ASC', 'DESC']);
      });

      it('should have exactly 2 values', () => {
        expect(VALID_SORT_DIRECTIONS).toHaveLength(2);
      });
    });
  });

  describe('isValidSortColumn', () => {
    describe('valid columns', () => {
      it('should return true for valid player columns', () => {
        expect(isValidSortColumn('players', 'first_name')).toBe(true);
        expect(isValidSortColumn('players', 'last_name')).toBe(true);
        expect(isValidSortColumn('players', 'position')).toBe(true);
        expect(isValidSortColumn('players', 'created_at')).toBe(true);
      });

      it('should return true for valid coach columns', () => {
        expect(isValidSortColumn('coaches', 'first_name')).toBe(true);
        expect(isValidSortColumn('coaches', 'school_name')).toBe(true);
        expect(isValidSortColumn('coaches', 'created_at')).toBe(true);
      });

      it('should return true for valid game columns', () => {
        expect(isValidSortColumn('games', 'game_date')).toBe(true);
        expect(isValidSortColumn('games', 'opponent')).toBe(true);
        expect(isValidSortColumn('games', 'created_at')).toBe(true);
      });

      it('should return true for valid vendor columns', () => {
        expect(isValidSortColumn('vendors', 'company_name')).toBe(true);
        expect(isValidSortColumn('vendors', 'contact_person')).toBe(true);
        expect(isValidSortColumn('vendors', 'created_at')).toBe(true);
      });
    });

    describe('invalid columns', () => {
      it('should return false for invalid column names', () => {
        expect(isValidSortColumn('players', 'invalid_column')).toBe(false);
        expect(isValidSortColumn('coaches', 'nonexistent')).toBe(false);
        expect(isValidSortColumn('games', 'fake_field')).toBe(false);
        expect(isValidSortColumn('vendors', 'wrong_column')).toBe(false);
      });

      it('should return false for columns from wrong entity type', () => {
        expect(isValidSortColumn('players', 'game_date')).toBe(false);
        expect(isValidSortColumn('coaches', 'company_name')).toBe(false);
        expect(isValidSortColumn('games', 'school_name')).toBe(false);
        expect(isValidSortColumn('vendors', 'graduation_year')).toBe(false);
      });

      it('should return false for invalid entity type', () => {
        expect(isValidSortColumn('invalid_entity', 'created_at')).toBe(false);
        expect(isValidSortColumn('users', 'first_name')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for null or undefined column', () => {
        expect(isValidSortColumn('players', null)).toBe(false);
        expect(isValidSortColumn('players', undefined)).toBe(false);
      });

      it('should return false for empty string column', () => {
        expect(isValidSortColumn('players', '')).toBe(false);
      });

      it('should return false for non-string column', () => {
        expect(isValidSortColumn('players', 123)).toBe(false);
        expect(isValidSortColumn('players', {})).toBe(false);
        expect(isValidSortColumn('players', [])).toBe(false);
      });

      it('should be case-sensitive', () => {
        expect(isValidSortColumn('players', 'FIRST_NAME')).toBe(false);
        expect(isValidSortColumn('players', 'First_Name')).toBe(false);
      });
    });
  });

  describe('isValidSortDirection', () => {
    describe('valid directions', () => {
      it('should return true for ASC', () => {
        expect(isValidSortDirection('ASC')).toBe(true);
      });

      it('should return true for DESC', () => {
        expect(isValidSortDirection('DESC')).toBe(true);
      });

      it('should return true for lowercase asc', () => {
        expect(isValidSortDirection('asc')).toBe(true);
      });

      it('should return true for lowercase desc', () => {
        expect(isValidSortDirection('desc')).toBe(true);
      });

      it('should return true for mixed case', () => {
        expect(isValidSortDirection('Asc')).toBe(true);
        expect(isValidSortDirection('AsC')).toBe(true);
        expect(isValidSortDirection('Desc')).toBe(true);
        expect(isValidSortDirection('DeSc')).toBe(true);
      });
    });

    describe('invalid directions', () => {
      it('should return false for invalid values', () => {
        expect(isValidSortDirection('ASCENDING')).toBe(false);
        expect(isValidSortDirection('DESCENDING')).toBe(false);
        expect(isValidSortDirection('up')).toBe(false);
        expect(isValidSortDirection('down')).toBe(false);
        expect(isValidSortDirection('1')).toBe(false);
        expect(isValidSortDirection('true')).toBe(false);
      });

      it('should return false for null or undefined', () => {
        expect(isValidSortDirection(null)).toBe(false);
        expect(isValidSortDirection(undefined)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isValidSortDirection('')).toBe(false);
      });

      it('should return false for non-string values', () => {
        expect(isValidSortDirection(123)).toBe(false);
        expect(isValidSortDirection({})).toBe(false);
        expect(isValidSortDirection([])).toBe(false);
        expect(isValidSortDirection(true)).toBe(false);
      });
    });
  });

  describe('normalizeSortDirection', () => {
    it('should convert lowercase to uppercase', () => {
      expect(normalizeSortDirection('asc')).toBe('ASC');
      expect(normalizeSortDirection('desc')).toBe('DESC');
    });

    it('should preserve uppercase', () => {
      expect(normalizeSortDirection('ASC')).toBe('ASC');
      expect(normalizeSortDirection('DESC')).toBe('DESC');
    });

    it('should normalize mixed case', () => {
      expect(normalizeSortDirection('Asc')).toBe('ASC');
      expect(normalizeSortDirection('DeSc')).toBe('DESC');
    });

    it('should return DESC for invalid values', () => {
      expect(normalizeSortDirection('invalid')).toBe('DESC');
      expect(normalizeSortDirection('up')).toBe('DESC');
      expect(normalizeSortDirection('ASCENDING')).toBe('DESC');
    });

    it('should return DESC for null or undefined', () => {
      expect(normalizeSortDirection(null)).toBe('DESC');
      expect(normalizeSortDirection(undefined)).toBe('DESC');
    });

    it('should return DESC for empty string', () => {
      expect(normalizeSortDirection('')).toBe('DESC');
    });

    it('should return DESC for non-string values', () => {
      expect(normalizeSortDirection(123)).toBe('DESC');
      expect(normalizeSortDirection({})).toBe('DESC');
      expect(normalizeSortDirection([])).toBe('DESC');
    });
  });

  describe('getAllowedSortColumns', () => {
    it('should return allowed columns for players', () => {
      const columns = getAllowedSortColumns('players');
      expect(columns).toContain('first_name');
      expect(columns).toContain('last_name');
      expect(columns).toContain('created_at');
      expect(Array.isArray(columns)).toBe(true);
    });

    it('should return allowed columns for coaches', () => {
      const columns = getAllowedSortColumns('coaches');
      expect(columns).toContain('first_name');
      expect(columns).toContain('school_name');
      expect(Array.isArray(columns)).toBe(true);
    });

    it('should return allowed columns for games', () => {
      const columns = getAllowedSortColumns('games');
      expect(columns).toContain('game_date');
      expect(columns).toContain('opponent');
      expect(Array.isArray(columns)).toBe(true);
    });

    it('should return allowed columns for vendors', () => {
      const columns = getAllowedSortColumns('vendors');
      expect(columns).toContain('company_name');
      expect(columns).toContain('contact_person');
      expect(Array.isArray(columns)).toBe(true);
    });

    it('should return empty array for invalid entity type', () => {
      expect(getAllowedSortColumns('invalid')).toEqual([]);
      expect(getAllowedSortColumns('users')).toEqual([]);
      expect(getAllowedSortColumns('')).toEqual([]);
    });

    it('should return empty array for null or undefined', () => {
      expect(getAllowedSortColumns(null)).toEqual([]);
      expect(getAllowedSortColumns(undefined)).toEqual([]);
    });
  });

  describe('getDefaultSortConfig', () => {
    it('should return default config for players', () => {
      expect(getDefaultSortConfig('players')).toEqual({
        orderBy: 'created_at',
        sortDirection: 'DESC'
      });
    });

    it('should return default config for coaches', () => {
      expect(getDefaultSortConfig('coaches')).toEqual({
        orderBy: 'created_at',
        sortDirection: 'DESC'
      });
    });

    it('should return default config for games', () => {
      expect(getDefaultSortConfig('games')).toEqual({
        orderBy: 'game_date',
        sortDirection: 'DESC'
      });
    });

    it('should return default config for vendors', () => {
      expect(getDefaultSortConfig('vendors')).toEqual({
        orderBy: 'created_at',
        sortDirection: 'DESC'
      });
    });

    it('should return fallback config for invalid entity type', () => {
      expect(getDefaultSortConfig('invalid')).toEqual({
        orderBy: 'created_at',
        sortDirection: 'DESC'
      });
    });

    it('should return fallback config for null or undefined', () => {
      expect(getDefaultSortConfig(null)).toEqual({
        orderBy: 'created_at',
        sortDirection: 'DESC'
      });
      expect(getDefaultSortConfig(undefined)).toEqual({
        orderBy: 'created_at',
        sortDirection: 'DESC'
      });
    });
  });

  describe('validateSortParams', () => {
    describe('valid parameters', () => {
      it('should validate correct parameters for players', () => {
        const result = validateSortParams('players', 'first_name', 'ASC');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate correct parameters for coaches', () => {
        const result = validateSortParams('coaches', 'school_name', 'DESC');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate correct parameters for games', () => {
        const result = validateSortParams('games', 'game_date', 'ASC');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate correct parameters for vendors', () => {
        const result = validateSortParams('vendors', 'company_name', 'DESC');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate with case-insensitive direction', () => {
        const result = validateSortParams('players', 'first_name', 'asc');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate when only orderBy is provided', () => {
        const result = validateSortParams('players', 'first_name', undefined);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate when only sortDirection is provided', () => {
        const result = validateSortParams('players', undefined, 'ASC');
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate when both parameters are undefined', () => {
        const result = validateSortParams('players', undefined, undefined);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });

    describe('invalid entity type', () => {
      it('should return error for invalid entity type', () => {
        const result = validateSortParams('invalid_entity', 'created_at', 'DESC');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid entity type: invalid_entity');
      });

      it('should return error for null entity type', () => {
        const result = validateSortParams(null, 'created_at', 'DESC');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return error for undefined entity type', () => {
        const result = validateSortParams(undefined, 'created_at', 'DESC');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('invalid orderBy', () => {
      it('should return error for invalid column', () => {
        const result = validateSortParams('players', 'invalid_column', 'ASC');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain('Invalid orderBy column');
        expect(result.errors[0]).toContain('invalid_column');
      });

      it('should include allowed columns in error message', () => {
        const result = validateSortParams('players', 'bad_column', 'ASC');
        expect(result.errors[0]).toContain('Allowed columns:');
        expect(result.errors[0]).toContain('first_name');
        expect(result.errors[0]).toContain('last_name');
      });

      it('should return error for column from wrong entity', () => {
        const result = validateSortParams('players', 'game_date', 'ASC');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('Invalid orderBy column');
      });
    });

    describe('invalid sortDirection', () => {
      it('should return error for invalid direction', () => {
        const result = validateSortParams('players', 'first_name', 'INVALID');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain('Invalid sortDirection');
        expect(result.errors[0]).toContain('INVALID');
      });

      it('should include valid directions in error message', () => {
        const result = validateSortParams('players', 'first_name', 'UP');
        expect(result.errors[0]).toContain("Must be 'ASC' or 'DESC'");
      });
    });

    describe('multiple errors', () => {
      it('should return multiple errors when both parameters are invalid', () => {
        const result = validateSortParams('players', 'invalid_column', 'INVALID_DIR');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(2);
        expect(result.errors.some(e => e.includes('Invalid orderBy'))).toBe(true);
        expect(result.errors.some(e => e.includes('Invalid sortDirection'))).toBe(true);
      });
    });
  });

  describe('buildOrderClause', () => {
    describe('with valid parameters', () => {
      it('should build order clause for players', () => {
        const result = buildOrderClause('players', 'first_name', 'ASC');
        expect(result).toEqual([['first_name', 'ASC']]);
      });

      it('should build order clause for coaches', () => {
        const result = buildOrderClause('coaches', 'school_name', 'DESC');
        expect(result).toEqual([['school_name', 'DESC']]);
      });

      it('should build order clause for games', () => {
        const result = buildOrderClause('games', 'game_date', 'ASC');
        expect(result).toEqual([['game_date', 'ASC']]);
      });

      it('should build order clause for vendors', () => {
        const result = buildOrderClause('vendors', 'company_name', 'DESC');
        expect(result).toEqual([['company_name', 'DESC']]);
      });

      it('should normalize direction to uppercase', () => {
        const result = buildOrderClause('players', 'first_name', 'asc');
        expect(result).toEqual([['first_name', 'ASC']]);
      });
    });

    describe('with default values', () => {
      it('should use default orderBy when not provided', () => {
        const result = buildOrderClause('players', undefined, 'ASC');
        expect(result).toEqual([['created_at', 'ASC']]);
      });

      it('should use default sortDirection when not provided', () => {
        const result = buildOrderClause('players', 'first_name', undefined);
        expect(result).toEqual([['first_name', 'DESC']]);
      });

      it('should use both defaults when neither provided', () => {
        const result = buildOrderClause('players');
        expect(result).toEqual([['created_at', 'DESC']]);
      });

      it('should use game_date as default for games entity', () => {
        const result = buildOrderClause('games');
        expect(result).toEqual([['game_date', 'DESC']]);
      });
    });

    describe('error handling', () => {
      it('should throw error for invalid entity type', () => {
        expect(() => {
          buildOrderClause('invalid_entity', 'created_at', 'DESC');
        }).toThrow('Invalid entity type');
      });

      it('should throw error for invalid column', () => {
        expect(() => {
          buildOrderClause('players', 'invalid_column', 'DESC');
        }).toThrow('Invalid orderBy column');
      });

      it('should normalize invalid direction to DESC', () => {
        const result = buildOrderClause('players', 'first_name', 'INVALID');
        expect(result).toEqual([['first_name', 'DESC']]);
      });

      it('should throw error for invalid column even with invalid direction', () => {
        expect(() => {
          buildOrderClause('players', 'invalid_column', 'INVALID_DIR');
        }).toThrow('Invalid orderBy column');
      });

      it('should include allowed columns in error message', () => {
        try {
          buildOrderClause('players', 'bad_column', 'ASC');
        } catch (error) {
          expect(error.message).toContain('Allowed columns:');
        }
      });
    });

    describe('return format', () => {
      it('should return array of arrays (Sequelize format)', () => {
        const result = buildOrderClause('players', 'first_name', 'ASC');
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(1);
        expect(Array.isArray(result[0])).toBe(true);
        expect(result[0]).toHaveLength(2);
      });

      it('should return proper structure for multiple potential orders', () => {
        const result = buildOrderClause('players', 'last_name', 'DESC');
        expect(result).toEqual([['last_name', 'DESC']]);
      });
    });
  });

  describe('createOrderByValidator', () => {
    it('should create a validator function', () => {
      const validator = createOrderByValidator('players');
      expect(typeof validator).toBe('function');
    });

    it('should return true for valid columns', () => {
      const validator = createOrderByValidator('players');
      expect(validator('first_name')).toBe(true);
      expect(validator('last_name')).toBe(true);
      expect(validator('created_at')).toBe(true);
    });

    it('should return true for empty value (optional)', () => {
      const validator = createOrderByValidator('players');
      expect(validator('')).toBe(true);
      expect(validator(null)).toBe(true);
      expect(validator(undefined)).toBe(true);
    });

    it('should throw error for invalid columns', () => {
      const validator = createOrderByValidator('players');
      expect(() => validator('invalid_column')).toThrow('Invalid orderBy column');
    });

    it('should include allowed columns in error', () => {
      const validator = createOrderByValidator('players');
      try {
        validator('bad_column');
      } catch (error) {
        expect(error.message).toContain('Allowed columns:');
        expect(error.message).toContain('first_name');
      }
    });

    it('should work for different entity types', () => {
      const playersValidator = createOrderByValidator('players');
      const coachesValidator = createOrderByValidator('coaches');
      const gamesValidator = createOrderByValidator('games');

      expect(playersValidator('first_name')).toBe(true);
      expect(coachesValidator('school_name')).toBe(true);
      expect(gamesValidator('game_date')).toBe(true);

      expect(() => playersValidator('game_date')).toThrow();
      expect(() => coachesValidator('game_date')).toThrow();
      expect(() => gamesValidator('first_name')).toThrow();
    });
  });

  describe('createSortValidators', () => {
    it('should return an array of validators', () => {
      const validators = createSortValidators('players');
      expect(Array.isArray(validators)).toBe(true);
      expect(validators).toHaveLength(2);
    });

    it('should create validators for each entity type', () => {
      expect(() => createSortValidators('players')).not.toThrow();
      expect(() => createSortValidators('coaches')).not.toThrow();
      expect(() => createSortValidators('games')).not.toThrow();
      expect(() => createSortValidators('vendors')).not.toThrow();
    });

    it('should create validators with proper structure', () => {
      const validators = createSortValidators('players');
      validators.forEach(validator => {
        expect(validator).toBeDefined();
      });
    });
  });

  describe('integration tests', () => {
    describe('complete sorting workflow', () => {
      it('should validate and build order clause for valid input', () => {
        const validation = validateSortParams('players', 'first_name', 'ASC');
        expect(validation.isValid).toBe(true);

        const orderClause = buildOrderClause('players', 'first_name', 'ASC');
        expect(orderClause).toEqual([['first_name', 'ASC']]);
      });

      it('should handle default values throughout workflow', () => {
        const validation = validateSortParams('games', undefined, undefined);
        expect(validation.isValid).toBe(true);

        const orderClause = buildOrderClause('games');
        expect(orderClause).toEqual([['game_date', 'DESC']]);
      });

      it('should reject invalid input at validation', () => {
        const validation = validateSortParams('players', 'invalid', 'ASC');
        expect(validation.isValid).toBe(false);

        expect(() => {
          buildOrderClause('players', 'invalid', 'ASC');
        }).toThrow();
      });
    });

    describe('all entities with all allowed columns', () => {
      const testCases = [
        { entity: 'players', columns: ['first_name', 'last_name', 'position', 'created_at'] },
        { entity: 'coaches', columns: ['first_name', 'school_name', 'created_at'] },
        { entity: 'games', columns: ['game_date', 'opponent', 'created_at'] },
        { entity: 'vendors', columns: ['company_name', 'contact_person', 'created_at'] }
      ];

      testCases.forEach(({ entity, columns }) => {
        columns.forEach(column => {
          it(`should handle ${entity}.${column} with ASC`, () => {
            const result = buildOrderClause(entity, column, 'ASC');
            expect(result).toEqual([[column, 'ASC']]);
          });

          it(`should handle ${entity}.${column} with DESC`, () => {
            const result = buildOrderClause(entity, column, 'DESC');
            expect(result).toEqual([[column, 'DESC']]);
          });
        });
      });
    });

    describe('case sensitivity handling', () => {
      it('should handle direction case-insensitively', () => {
        const lower = buildOrderClause('players', 'first_name', 'asc');
        const upper = buildOrderClause('players', 'first_name', 'ASC');
        const mixed = buildOrderClause('players', 'first_name', 'Asc');

        expect(lower).toEqual(upper);
        expect(upper).toEqual(mixed);
      });

      it('should be case-sensitive for column names', () => {
        expect(() => {
          buildOrderClause('players', 'FIRST_NAME', 'ASC');
        }).toThrow();

        expect(() => {
          buildOrderClause('players', 'First_Name', 'ASC');
        }).toThrow();
      });
    });
  });
});

const {
  validateEnvironment,
  validateAndLogEnvironment
} = require('../validateEnv');

// Generate a secure test secret (64 hex chars = 32 bytes = 256 bits)
const SECURE_SECRET = 'f7a2b9c1d4e6f8a0b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9';
const WEAK_SECRET = 'tooshort';
const PLACEHOLDER_SECRET = 'your_super_secret_jwt_key_here';

describe('validateEnv', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_SECRET = originalJwtSecret;
  });

  describe('validateEnvironment', () => {
    describe('with valid configuration', () => {
      it('returns valid:true with secure JWT_SECRET in production', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: SECURE_SECRET },
          nodeEnv: 'production'
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      it('returns valid:true with secure JWT_SECRET in development', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: SECURE_SECRET },
          nodeEnv: 'development'
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('returns valid:true with secure JWT_SECRET in test mode', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: SECURE_SECRET },
          nodeEnv: 'test'
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('with invalid configuration', () => {
      it('returns valid:false with weak JWT_SECRET in production', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: WEAK_SECRET },
          nodeEnv: 'production'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('returns valid:false with weak JWT_SECRET in staging', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: WEAK_SECRET },
          nodeEnv: 'staging'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('returns valid:false with placeholder JWT_SECRET', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: PLACEHOLDER_SECRET },
          nodeEnv: 'development'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
      });

      it('returns valid:false with undefined JWT_SECRET', () => {
        const result = validateEnvironment({
          env: {},
          nodeEnv: 'production'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('not defined'))).toBe(true);
      });
    });

    describe('error vs warning scenarios', () => {
      it('treats short secrets as errors in production', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: WEAK_SECRET },
          nodeEnv: 'production'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('too short'))).toBe(true);
        expect(result.warnings.filter(w => w.includes('too short'))).toHaveLength(0);
      });

      it('treats short secrets as warnings in development', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: 'unique-dev-secret-ok' },
          nodeEnv: 'development'
        });
        // Short but unique secrets are warnings in dev mode
        expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
      });

      it('treats short secrets as warnings in test mode', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: 'unique-test-secret' },
          nodeEnv: 'test'
        });
        expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
      });

      it('always treats placeholder patterns as errors', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: 'your_secret_key_here_1234567890ab' },
          nodeEnv: 'development'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
      });
    });

    describe('using process.env', () => {
      it('uses process.env when env option not provided', () => {
        process.env.JWT_SECRET = SECURE_SECRET;
        process.env.NODE_ENV = 'production';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });

      it('uses env.NODE_ENV when nodeEnv option not provided', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: WEAK_SECRET, NODE_ENV: 'production' }
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('defaults to development when NODE_ENV not set', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: 'unique-dev-secret-only' }
        });
        // Development mode treats short secrets as warnings, not errors
        expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
      });
    });

    describe('return structure', () => {
      it('always returns valid, errors, and warnings properties', () => {
        const result = validateEnvironment({
          env: { JWT_SECRET: SECURE_SECRET },
          nodeEnv: 'production'
        });
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      });

      it('sets valid:true only when errors array is empty', () => {
        const validResult = validateEnvironment({
          env: { JWT_SECRET: SECURE_SECRET },
          nodeEnv: 'production'
        });
        expect(validResult.valid).toBe(true);
        expect(validResult.errors).toHaveLength(0);

        const invalidResult = validateEnvironment({
          env: { JWT_SECRET: WEAK_SECRET },
          nodeEnv: 'production'
        });
        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('validateAndLogEnvironment', () => {
    let stderrSpy;

    beforeEach(() => {
      stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('returns the same result as validateEnvironment', () => {
      const options = {
        env: { JWT_SECRET: SECURE_SECRET },
        nodeEnv: 'production'
      };
      const validateResult = validateEnvironment(options);
      const logResult = validateAndLogEnvironment(options);

      expect(logResult.valid).toBe(validateResult.valid);
      expect(logResult.errors).toEqual(validateResult.errors);
      expect(logResult.warnings).toEqual(validateResult.warnings);
    });

    it('logs errors to stderr when validation fails', () => {
      validateAndLogEnvironment({
        env: { JWT_SECRET: WEAK_SECRET },
        nodeEnv: 'production'
      });
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('ENVIRONMENT VALIDATION ERRORS');
    });

    it('includes generation instructions when there are errors', () => {
      validateAndLogEnvironment({
        env: { JWT_SECRET: WEAK_SECRET },
        nodeEnv: 'production'
      });
      const output = stderrSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('npm run generate:jwt-secret');
    });

    it('logs warnings to stderr when there are warnings', () => {
      validateAndLogEnvironment({
        env: { JWT_SECRET: 'unique-dev-secret-test' },
        nodeEnv: 'development'
      });
      const output = stderrSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('ENVIRONMENT WARNINGS');
    });

    it('does not log when validation passes with no warnings', () => {
      validateAndLogEnvironment({
        env: { JWT_SECRET: SECURE_SECRET },
        nodeEnv: 'production'
      });
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('logs individual error messages', () => {
      validateAndLogEnvironment({
        env: {},
        nodeEnv: 'production'
      });
      const output = stderrSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('not defined');
    });

    it('logs individual warning messages', () => {
      validateAndLogEnvironment({
        env: { JWT_SECRET: 'unique-dev-secret-x' },
        nodeEnv: 'development'
      });
      const output = stderrSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('too short');
    });
  });
});

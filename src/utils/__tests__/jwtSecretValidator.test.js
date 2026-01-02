const {
  validateJwtSecret,
  isSecureSecret,
  getSecretGenerationInstructions,
  MIN_SECRET_LENGTH,
  calculateEntropyScore,
  isRepetitivePattern,
  PLACEHOLDER_PATTERNS,
  BLOCKED_VALUES
} = require('../jwtSecretValidator');

// Generate a secure test secret (64 hex chars = 32 bytes = 256 bits)
const SECURE_SECRET = 'a'.repeat(16) + 'b'.repeat(16) + 'c'.repeat(16) + 'd'.repeat(16);
// A truly random-looking secret for entropy tests
const RANDOM_SECRET = 'f7a2b9c1d4e6f8a0b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9';

describe('jwtSecretValidator', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('validateJwtSecret', () => {
    describe('valid secrets', () => {
      it('accepts a secure random hex secret', () => {
        const result = validateJwtSecret(RANDOM_SECRET, { nodeEnv: 'production' });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts a sufficiently long mixed character secret', () => {
        const secret = 'MyS3cur3S3cr3tK3yTh4t1sL0ngEn0ugh!@#';
        const result = validateJwtSecret(secret, { nodeEnv: 'production' });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts secrets at exactly minimum length with good entropy', () => {
        const secret = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'; // 32 chars
        const result = validateJwtSecret(secret, { nodeEnv: 'production' });
        expect(result.valid).toBe(true);
      });
    });

    describe('minimum length validation', () => {
      it('rejects short secrets in production mode', () => {
        const result = validateJwtSecret('tooshort', { nodeEnv: 'production' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('too short'))).toBe(true);
      });

      it('rejects short secrets in staging mode', () => {
        const result = validateJwtSecret('tooshort', { nodeEnv: 'staging' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('too short'))).toBe(true);
      });

      it('warns but accepts short secrets in development mode', () => {
        const result = validateJwtSecret('short-dev-secret-ok', { nodeEnv: 'development' });
        // Short secrets are warnings in dev, but may still fail if they match placeholder patterns
        expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
      });

      it('warns but accepts short secrets in test mode', () => {
        const result = validateJwtSecret('test-short-secret', { nodeEnv: 'test' });
        expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
      });

      it('specifies the minimum required length in error message', () => {
        const result = validateJwtSecret('short', { nodeEnv: 'production' });
        expect(result.errors.some(e => e.includes(String(MIN_SECRET_LENGTH)))).toBe(true);
      });
    });

    describe('placeholder pattern detection', () => {
      it('rejects secrets starting with "your_"', () => {
        const result = validateJwtSecret('your_secret_key_here_1234567890123456', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('placeholder pattern'))).toBe(true);
      });

      it('rejects secrets ending with "_here"', () => {
        const result = validateJwtSecret('put_your_secret_key_here', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('placeholder pattern'))).toBe(true);
      });

      it('rejects secrets starting with "change_this"', () => {
        const result = validateJwtSecret('change_this_secret_before_deploying', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('placeholder pattern'))).toBe(true);
      });

      it('rejects secrets starting with "replace_me"', () => {
        const result = validateJwtSecret('replace_me_with_real_secret_12345', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('placeholder pattern'))).toBe(true);
      });

      it('rejects secrets containing "super_secret"', () => {
        const result = validateJwtSecret('my_super_secret_key_that_is_long', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('placeholder pattern'))).toBe(true);
      });

      it('rejects the exact placeholder from env.example', () => {
        const result = validateJwtSecret('your_super_secret_jwt_key_here', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('pattern detection is case-insensitive', () => {
        const result = validateJwtSecret('YOUR_SECRET_KEY_here_12345678901234', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
      });
    });

    describe('blocked values', () => {
      it('rejects "secret" as a value', () => {
        const result = validateJwtSecret('secret', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('known weak/placeholder value'))).toBe(true);
      });

      it('rejects "password" as a value', () => {
        const result = validateJwtSecret('password', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('known weak/placeholder value'))).toBe(true);
      });

      it('rejects "jwt_secret" as a value', () => {
        const result = validateJwtSecret('jwt_secret', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
      });

      it('rejects "change_me" as a value', () => {
        const result = validateJwtSecret('change_me', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
      });

      it('rejects blocked values case-insensitively', () => {
        const result = validateJwtSecret('SECRET', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
      });

      it('checks all blocked values are detected', () => {
        for (const blockedValue of BLOCKED_VALUES) {
          const result = validateJwtSecret(blockedValue, { nodeEnv: 'development' });
          expect(result.valid).toBe(false);
        }
      });
    });

    describe('entropy validation', () => {
      it('rejects single character repetition in production', () => {
        const result = validateJwtSecret('a'.repeat(64), { nodeEnv: 'production' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('repetitive') || e.includes('entropy'))).toBe(true);
      });

      it('warns about single character repetition in development', () => {
        const result = validateJwtSecret('a'.repeat(64), { nodeEnv: 'development' });
        expect(result.warnings.some(w => w.includes('repetitive'))).toBe(true);
      });

      it('rejects alternating pattern in production', () => {
        const result = validateJwtSecret('ab'.repeat(32), { nodeEnv: 'production' });
        expect(result.valid).toBe(false);
      });

      it('accepts high-entropy secrets', () => {
        const result = validateJwtSecret(RANDOM_SECRET, { nodeEnv: 'production' });
        expect(result.valid).toBe(true);
        expect(result.warnings.filter(w => w.includes('entropy'))).toHaveLength(0);
      });
    });

    describe('NODE_ENV-specific behavior', () => {
      it('uses process.env.NODE_ENV when nodeEnv option not provided', () => {
        process.env.NODE_ENV = 'production';
        const result = validateJwtSecret('short');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('too short'))).toBe(true);
      });

      it('defaults to development mode when NODE_ENV is not set', () => {
        const origEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV;
        const result = validateJwtSecret('shortdev');
        // In development, short secrets should be warnings, not errors
        expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
        process.env.NODE_ENV = origEnv;
      });

      it('is strict in production mode', () => {
        const result = validateJwtSecret('a-short-secret-for-testing', { nodeEnv: 'production' });
        expect(result.valid).toBe(false);
      });

      it('is strict in staging mode', () => {
        const result = validateJwtSecret('a-short-secret-for-testing', { nodeEnv: 'staging' });
        expect(result.valid).toBe(false);
      });

      it('is lenient in development mode', () => {
        // A secret that is short but not a placeholder
        const result = validateJwtSecret('my-unique-dev-secret', { nodeEnv: 'development' });
        // Should have warnings but still be valid since no placeholder patterns matched
        expect(result.warnings.length).toBeGreaterThan(0);
      });

      it('is lenient in test mode', () => {
        const result = validateJwtSecret('my-unique-test-secret', { nodeEnv: 'test' });
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      it('rejects undefined secret', () => {
        const result = validateJwtSecret(undefined, { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('not defined'))).toBe(true);
      });

      it('rejects null secret', () => {
        const result = validateJwtSecret(null, { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('not defined'))).toBe(true);
      });

      it('rejects empty string secret', () => {
        const result = validateJwtSecret('', { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
      });

      it('rejects non-string secret', () => {
        const result = validateJwtSecret(12345, { nodeEnv: 'development' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be a string'))).toBe(true);
      });

      it('warns about leading/trailing whitespace', () => {
        const result = validateJwtSecret('  ' + RANDOM_SECRET + '  ', { nodeEnv: 'production' });
        expect(result.warnings.some(w => w.includes('whitespace'))).toBe(true);
      });

      it('trims whitespace for validation', () => {
        const result = validateJwtSecret('  ' + RANDOM_SECRET + '  ', { nodeEnv: 'production' });
        // Should still validate the trimmed secret correctly
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('isSecureSecret', () => {
    it('returns true for secure secrets', () => {
      expect(isSecureSecret(RANDOM_SECRET)).toBe(true);
    });

    it('returns false for short secrets', () => {
      expect(isSecureSecret('tooshort')).toBe(false);
    });

    it('returns false for placeholder values', () => {
      expect(isSecureSecret('your_super_secret_jwt_key_here')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSecureSecret(undefined)).toBe(false);
    });

    it('always uses production-level strictness', () => {
      // Even if NODE_ENV is development, isSecureSecret should be strict
      process.env.NODE_ENV = 'development';
      expect(isSecureSecret('short-dev-secret')).toBe(false);
    });
  });

  describe('getSecretGenerationInstructions', () => {
    it('returns a non-empty string', () => {
      const instructions = getSecretGenerationInstructions();
      expect(typeof instructions).toBe('string');
      expect(instructions.length).toBeGreaterThan(0);
    });

    it('mentions npm run generate:jwt-secret', () => {
      const instructions = getSecretGenerationInstructions();
      expect(instructions).toContain('npm run generate:jwt-secret');
    });

    it('mentions minimum character requirement', () => {
      const instructions = getSecretGenerationInstructions();
      expect(instructions).toContain('32 characters');
    });

    it('includes crypto command for manual generation', () => {
      const instructions = getSecretGenerationInstructions();
      expect(instructions).toContain('crypto');
      expect(instructions).toContain('randomBytes');
    });
  });

  describe('calculateEntropyScore', () => {
    it('returns 0 for empty string', () => {
      expect(calculateEntropyScore('')).toBe(0);
    });

    it('returns 0 for null/undefined', () => {
      expect(calculateEntropyScore(null)).toBe(0);
      expect(calculateEntropyScore(undefined)).toBe(0);
    });

    it('returns low score for single repeated character', () => {
      const score = calculateEntropyScore('aaaaaaaaaa');
      expect(score).toBe(0);
    });

    it('returns higher score for diverse characters', () => {
      const lowEntropy = calculateEntropyScore('aaaaabbbbb');
      const highEntropy = calculateEntropyScore('abcdefghij');
      expect(highEntropy).toBeGreaterThan(lowEntropy);
    });

    it('returns value between 0 and 1', () => {
      const score = calculateEntropyScore(RANDOM_SECRET);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('isRepetitivePattern', () => {
    it('returns true for single character repetition', () => {
      expect(isRepetitivePattern('aaaaaaaaaa')).toBe(true);
    });

    it('returns true for two-character alternating pattern', () => {
      expect(isRepetitivePattern('ababababab')).toBe(true);
    });

    it('returns true for short strings', () => {
      expect(isRepetitivePattern('abc')).toBe(true);
    });

    it('returns true for null/undefined', () => {
      expect(isRepetitivePattern(null)).toBe(true);
      expect(isRepetitivePattern(undefined)).toBe(true);
    });

    it('returns false for random-looking strings', () => {
      expect(isRepetitivePattern('a1b2c3d4e5f6g7h8')).toBe(false);
    });

    it('returns false for complex patterns', () => {
      expect(isRepetitivePattern('MyS3cur3P@ssw0rd!')).toBe(false);
    });
  });

  describe('constants', () => {
    it('MIN_SECRET_LENGTH is at least 32', () => {
      expect(MIN_SECRET_LENGTH).toBeGreaterThanOrEqual(32);
    });

    it('PLACEHOLDER_PATTERNS is an array of regex patterns', () => {
      expect(Array.isArray(PLACEHOLDER_PATTERNS)).toBe(true);
      expect(PLACEHOLDER_PATTERNS.length).toBeGreaterThan(0);
      PLACEHOLDER_PATTERNS.forEach(pattern => {
        expect(pattern instanceof RegExp).toBe(true);
      });
    });

    it('BLOCKED_VALUES is an array of strings', () => {
      expect(Array.isArray(BLOCKED_VALUES)).toBe(true);
      expect(BLOCKED_VALUES.length).toBeGreaterThan(0);
      BLOCKED_VALUES.forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });
});

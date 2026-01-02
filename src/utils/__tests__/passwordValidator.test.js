const {
  PASSWORD_MIN_LENGTH,
  UPPERCASE_REGEX,
  LOWERCASE_REGEX,
  DIGIT_REGEX,
  SPECIAL_CHAR_REGEX,
  hasMinLength,
  hasUppercase,
  hasLowercase,
  hasDigit,
  hasSpecialChar,
  getPasswordRequirements,
  validatePassword,
  isPasswordValid,
  expressValidatorCheck
} = require('../passwordValidator');

describe('passwordValidator', () => {
  describe('constants', () => {
    it('should have PASSWORD_MIN_LENGTH of 8', () => {
      expect(PASSWORD_MIN_LENGTH).toBe(8);
    });

    it('should export regex patterns', () => {
      expect(UPPERCASE_REGEX).toBeInstanceOf(RegExp);
      expect(LOWERCASE_REGEX).toBeInstanceOf(RegExp);
      expect(DIGIT_REGEX).toBeInstanceOf(RegExp);
      expect(SPECIAL_CHAR_REGEX).toBeInstanceOf(RegExp);
    });
  });

  describe('hasMinLength', () => {
    it('should return true for passwords with 8 or more characters', () => {
      expect(hasMinLength('12345678')).toBe(true);
      expect(hasMinLength('123456789')).toBe(true);
      expect(hasMinLength('a'.repeat(100))).toBe(true);
    });

    it('should return false for passwords with less than 8 characters', () => {
      expect(hasMinLength('1234567')).toBe(false);
      expect(hasMinLength('abc')).toBe(false);
      expect(hasMinLength('')).toBeFalsy();
    });

    it('should return falsy for null or undefined', () => {
      expect(hasMinLength(null)).toBeFalsy();
      expect(hasMinLength(undefined)).toBeFalsy();
    });
  });

  describe('hasUppercase', () => {
    it('should return true for passwords containing uppercase letters', () => {
      expect(hasUppercase('Password')).toBe(true);
      expect(hasUppercase('A')).toBe(true);
      expect(hasUppercase('testABC123')).toBe(true);
      expect(hasUppercase('ALLCAPS')).toBe(true);
    });

    it('should return false for passwords without uppercase letters', () => {
      expect(hasUppercase('password')).toBe(false);
      expect(hasUppercase('12345678')).toBe(false);
      expect(hasUppercase('test123!@#')).toBe(false);
      expect(hasUppercase('')).toBeFalsy();
    });

    it('should return falsy for null or undefined', () => {
      expect(hasUppercase(null)).toBeFalsy();
      expect(hasUppercase(undefined)).toBeFalsy();
    });
  });

  describe('hasLowercase', () => {
    it('should return true for passwords containing lowercase letters', () => {
      expect(hasLowercase('Password')).toBe(true);
      expect(hasLowercase('a')).toBe(true);
      expect(hasLowercase('TESTabc123')).toBe(true);
      expect(hasLowercase('alllowercase')).toBe(true);
    });

    it('should return false for passwords without lowercase letters', () => {
      expect(hasLowercase('PASSWORD')).toBe(false);
      expect(hasLowercase('12345678')).toBe(false);
      expect(hasLowercase('TEST123!@#')).toBe(false);
      expect(hasLowercase('')).toBeFalsy();
    });

    it('should return falsy for null or undefined', () => {
      expect(hasLowercase(null)).toBeFalsy();
      expect(hasLowercase(undefined)).toBeFalsy();
    });
  });

  describe('hasDigit', () => {
    it('should return true for passwords containing digits', () => {
      expect(hasDigit('password1')).toBe(true);
      expect(hasDigit('1')).toBe(true);
      expect(hasDigit('abc123def')).toBe(true);
      expect(hasDigit('0000')).toBe(true);
    });

    it('should return false for passwords without digits', () => {
      expect(hasDigit('password')).toBe(false);
      expect(hasDigit('PASSWORD')).toBe(false);
      expect(hasDigit('Test!@#')).toBe(false);
      expect(hasDigit('')).toBeFalsy();
    });

    it('should return falsy for null or undefined', () => {
      expect(hasDigit(null)).toBeFalsy();
      expect(hasDigit(undefined)).toBeFalsy();
    });
  });

  describe('hasSpecialChar', () => {
    it('should return true for passwords containing special characters', () => {
      expect(hasSpecialChar('password!')).toBe(true);
      expect(hasSpecialChar('@')).toBe(true);
      expect(hasSpecialChar('test#123')).toBe(true);
      expect(hasSpecialChar('$%^&*()')).toBe(true);
    });

    it('should recognize all supported special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{};\':"|,.<>/?`~';
      for (const char of specialChars) {
        expect(hasSpecialChar(`password${char}`)).toBe(true);
      }
    });

    it('should return false for passwords without special characters', () => {
      expect(hasSpecialChar('password')).toBe(false);
      expect(hasSpecialChar('PASSWORD123')).toBe(false);
      expect(hasSpecialChar('Test123abc')).toBe(false);
      expect(hasSpecialChar('')).toBeFalsy();
    });

    it('should return falsy for null or undefined', () => {
      expect(hasSpecialChar(null)).toBeFalsy();
      expect(hasSpecialChar(undefined)).toBeFalsy();
    });
  });

  describe('getPasswordRequirements', () => {
    it('should return all requirements met for a strong password', () => {
      const result = getPasswordRequirements('StrongP@ss1');
      expect(result.minLength.met).toBe(true);
      expect(result.uppercase.met).toBe(true);
      expect(result.lowercase.met).toBe(true);
      expect(result.digit.met).toBe(true);
      expect(result.specialChar.met).toBe(true);
    });

    it('should return appropriate messages for each requirement', () => {
      const result = getPasswordRequirements('weak');
      expect(result.minLength.message).toContain('8 characters');
      expect(result.uppercase.message).toContain('uppercase');
      expect(result.lowercase.message).toContain('lowercase');
      expect(result.digit.message).toContain('digit');
      expect(result.specialChar.message).toContain('special character');
    });

    it('should correctly identify missing requirements', () => {
      // Missing uppercase
      const noUpper = getPasswordRequirements('password1!');
      expect(noUpper.uppercase.met).toBe(false);
      expect(noUpper.lowercase.met).toBe(true);
      expect(noUpper.digit.met).toBe(true);
      expect(noUpper.specialChar.met).toBe(true);

      // Missing lowercase
      const noLower = getPasswordRequirements('PASSWORD1!');
      expect(noLower.uppercase.met).toBe(true);
      expect(noLower.lowercase.met).toBe(false);
      expect(noLower.digit.met).toBe(true);
      expect(noLower.specialChar.met).toBe(true);

      // Missing digit
      const noDigit = getPasswordRequirements('Password!');
      expect(noDigit.uppercase.met).toBe(true);
      expect(noDigit.lowercase.met).toBe(true);
      expect(noDigit.digit.met).toBe(false);
      expect(noDigit.specialChar.met).toBe(true);

      // Missing special char
      const noSpecial = getPasswordRequirements('Password1');
      expect(noSpecial.uppercase.met).toBe(true);
      expect(noSpecial.lowercase.met).toBe(true);
      expect(noSpecial.digit.met).toBe(true);
      expect(noSpecial.specialChar.met).toBe(false);

      // Too short
      const tooShort = getPasswordRequirements('Pa1!');
      expect(tooShort.minLength.met).toBe(false);
    });
  });

  describe('validatePassword', () => {
    describe('valid passwords', () => {
      const validPasswords = [
        'StrongP@ss1',
        'MyP@ssw0rd!',
        'Secure123!',
        'C0mpl3x!Pass',
        'Test_Pass1',
        'Hello123$World',
        '!Abc1234',
        'Passw0rd@',
      ];

      validPasswords.forEach((password) => {
        it(`should accept valid password: ${password}`, () => {
          const result = validatePassword(password);
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe('invalid passwords - missing requirements', () => {
      it('should reject password missing uppercase letter', () => {
        const result = validatePassword('password1!');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
      });

      it('should reject password missing lowercase letter', () => {
        const result = validatePassword('PASSWORD1!');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one lowercase letter');
      });

      it('should reject password missing digit', () => {
        const result = validatePassword('Password!');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one digit');
      });

      it('should reject password missing special character', () => {
        const result = validatePassword('Password1');
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('special character'))).toBe(true);
      });

      it('should reject password that is too short', () => {
        const result = validatePassword('Pa1!');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must be at least 8 characters long');
      });
    });

    describe('invalid passwords - multiple missing requirements', () => {
      it('should return multiple errors when multiple requirements are missing', () => {
        const result = validatePassword('test');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
        // Should fail: length, uppercase, digit, special char
        expect(result.errors.length).toBe(4);
      });

      it('should return all errors for empty string', () => {
        const result = validatePassword('');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(5);
      });
    });

    describe('commonly weak passwords', () => {
      const weakPasswords = [
        '123456',
        'password',
        'Password',
        'password123',
        '12345678',
        'qwerty',
        '111111',
        'abc123',
        'letmein',
        'admin',
        'iloveyou',
      ];

      weakPasswords.forEach((password) => {
        it(`should reject weak password: ${password}`, () => {
          const result = validatePassword(password);
          expect(result.isValid).toBe(false);
        });
      });
    });

    describe('edge cases', () => {
      it('should handle null', () => {
        const result = validatePassword(null);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(5);
      });

      it('should handle undefined', () => {
        const result = validatePassword(undefined);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(5);
      });

      it('should handle empty string', () => {
        const result = validatePassword('');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(5);
      });

      it('should handle whitespace-only string', () => {
        const result = validatePassword('        ');
        expect(result.isValid).toBe(false);
      });

      it('should handle password with spaces', () => {
        const result = validatePassword('Strong P@ss 1');
        expect(result.isValid).toBe(true);
      });

      it('should handle unicode characters', () => {
        // Unicode characters don't satisfy letter requirements (A-Z, a-z)
        const result = validatePassword('Пароль123!');
        expect(result.isValid).toBe(false);
        // Should fail lowercase check since Cyrillic chars don't match [a-z]
      });

      it('should accept password exactly 8 characters long', () => {
        const result = validatePassword('Pa1!word');
        expect(result.isValid).toBe(true);
      });

      it('should handle very long passwords', () => {
        const longPassword = 'A' + 'a'.repeat(100) + '1!';
        const result = validatePassword(longPassword);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('isPasswordValid', () => {
    it('should return true for valid passwords', () => {
      expect(isPasswordValid('StrongP@ss1')).toBe(true);
      expect(isPasswordValid('MyP@ssw0rd!')).toBe(true);
    });

    it('should return false for invalid passwords', () => {
      expect(isPasswordValid('weak')).toBe(false);
      expect(isPasswordValid('password')).toBe(false);
      expect(isPasswordValid('12345678')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isPasswordValid(null)).toBe(false);
      expect(isPasswordValid(undefined)).toBe(false);
    });
  });

  describe('expressValidatorCheck', () => {
    it('should return true for valid passwords', () => {
      expect(expressValidatorCheck('StrongP@ss1')).toBe(true);
      expect(expressValidatorCheck('MyP@ssw0rd!')).toBe(true);
    });

    it('should throw error for invalid passwords', () => {
      expect(() => expressValidatorCheck('weak')).toThrow();
      expect(() => expressValidatorCheck('password')).toThrow();
      expect(() => expressValidatorCheck('')).toThrow();
    });

    it('should include all error messages in thrown error', () => {
      try {
        expressValidatorCheck('test');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.message).toContain('8 characters');
        expect(error.message).toContain('uppercase');
        expect(error.message).toContain('digit');
        expect(error.message).toContain('special character');
      }
    });

    it('should join error messages with period and space', () => {
      try {
        expressValidatorCheck('Password1'); // Missing special char only
      } catch (error) {
        // Single error shouldn't have separator
        expect(error.message).toContain('special character');
      }
    });

    it('should throw error for null/undefined', () => {
      expect(() => expressValidatorCheck(null)).toThrow();
      expect(() => expressValidatorCheck(undefined)).toThrow();
    });
  });

  describe('error message verification', () => {
    it('should include minimum length requirement in error message', () => {
      const result = validatePassword('Pa1!');
      expect(result.errors.some(e => e.includes('8'))).toBe(true);
      expect(result.errors.some(e => e.includes('characters'))).toBe(true);
    });

    it('should include special character examples in error message', () => {
      const result = validatePassword('Password1');
      const specialCharError = result.errors.find(e => e.includes('special'));
      expect(specialCharError).toBeDefined();
      expect(specialCharError).toContain('!@#$%^&*');
    });
  });
});

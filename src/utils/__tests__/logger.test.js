const logger = require('../logger');

describe('logger utility', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.NODE_ENV;

    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore environment
    process.env.NODE_ENV = originalEnv;

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('email sanitization', () => {
    it('should redact email addresses in field values', () => {
      const data = { email: 'user@example.com' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.email).toBe('[REDACTED_EMAIL]');
    });

    it('should redact email patterns in string values', () => {
      const data = { message: 'Contact john.doe@company.com for help' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.message).toBe('[REDACTED_EMAIL]');
    });

    it('should redact emailAddress field', () => {
      const data = { emailAddress: 'admin@test.org' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.emailAddress).toBe('[REDACTED_EMAIL]');
    });

    it('should redact email_address field', () => {
      const data = { email_address: 'support@service.net' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.email_address).toBe('[REDACTED_EMAIL]');
    });

    it('should detect email patterns with various TLDs', () => {
      const emails = [
        'test@example.com',
        'user@domain.org',
        'admin@site.net',
        'info@company.edu',
        'support@gov.gov',
        'contact@startup.io',
        'hello@business.co'
      ];

      emails.forEach(email => {
        const sanitized = logger.sanitize({ value: email });
        expect(sanitized.value).toBe('[REDACTED_EMAIL]');
      });
    });

    it('should log with email sanitization', () => {
      logger.info('User registered', { email: 'newuser@example.com' });
      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedMessage = consoleLogSpy.mock.calls[0][1];
      expect(loggedMessage).toContain('[REDACTED_EMAIL]');
      expect(loggedMessage).not.toContain('newuser@example.com');
    });
  });

  describe('password and token redaction', () => {
    it('should redact password field', () => {
      const data = { password: 'SecretP@ss123' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.password).toBe('[REDACTED_PASSWORD]');
    });

    it('should redact password_hash field', () => {
      const data = { password_hash: '$2b$10$abcdef...' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.password_hash).toBe('[REDACTED_PASSWORD]');
    });

    it('should redact newPassword field', () => {
      const data = { newPassword: 'NewP@ss456' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.newPassword).toBe('[REDACTED_PASSWORD]');
    });

    it('should redact currentPassword field', () => {
      const data = { currentPassword: 'CurrentP@ss789' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.currentPassword).toBe('[REDACTED_PASSWORD]');
    });

    it('should redact token field', () => {
      const data = { token: 'abc123xyz789token' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.token).toBe('[REDACTED_TOKEN]');
    });

    it('should redact accessToken field', () => {
      const data = { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.accessToken).toBe('[REDACTED_TOKEN]');
    });

    it('should redact refreshToken field', () => {
      const data = { refreshToken: 'refresh_token_value' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.refreshToken).toBe('[REDACTED_TOKEN]');
    });

    it('should redact jwt field', () => {
      const data = { jwt: 'jwt.token.signature' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.jwt).toBe('[REDACTED_TOKEN]');
    });

    it('should redact authorization field', () => {
      const data = { authorization: 'Bearer token123' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.authorization).toBe('[REDACTED_CREDENTIAL]');
    });

    it('should detect JWT token patterns', () => {
      const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const sanitized = logger.sanitize({ value: jwtToken });
      expect(sanitized.value).toBe('[REDACTED_TOKEN]');
    });

    it('should redact api_key field', () => {
      const data = { api_key: 'sk_test_1234567890abcdef' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.api_key).toBe('[REDACTED_KEY]');
    });

    it('should redact apiKey field', () => {
      const data = { apiKey: 'api_key_value' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.apiKey).toBe('[REDACTED_KEY]');
    });

    it('should redact secret field', () => {
      const data = { secret: 'my_secret_value' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.secret).toBe('[REDACTED_SECRET]');
    });

    it('should redact secretKey field', () => {
      const data = { secretKey: 'secret_key_value' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.secretKey).toBe('[REDACTED_SECRET]');
    });

    it('should redact privateKey field', () => {
      const data = { privateKey: '-----BEGIN PRIVATE KEY-----' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.privateKey).toBe('[REDACTED_KEY]');
    });
  });

  describe('user and team ID masking', () => {
    it('should redact user_id field', () => {
      const data = { user_id: 12345 };
      const sanitized = logger.sanitize(data);
      expect(sanitized.user_id).toBe('[REDACTED_ID]');
    });

    it('should redact userId field', () => {
      const data = { userId: 67890 };
      const sanitized = logger.sanitize(data);
      expect(sanitized.userId).toBe('[REDACTED_ID]');
    });

    it('should redact team_id field', () => {
      const data = { team_id: 'team_123' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.team_id).toBe('[REDACTED_ID]');
    });

    it('should redact teamId field', () => {
      const data = { teamId: 'team_456' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.teamId).toBe('[REDACTED_ID]');
    });

    it('should redact IDs in nested objects', () => {
      const data = {
        user: {
          user_id: 123,
          team_id: 456,
          name: 'John Doe'
        }
      };
      const sanitized = logger.sanitize(data);
      expect(sanitized.user.user_id).toBe('[REDACTED_ID]');
      expect(sanitized.user.team_id).toBe('[REDACTED_ID]');
      expect(sanitized.user.name).toBe('John Doe');
    });

    it('should log with ID masking', () => {
      logger.info('User action', { user_id: 123, team_id: 456 });
      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedMessage = consoleLogSpy.mock.calls[0][1];
      expect(loggedMessage).toContain('[REDACTED_ID]');
      expect(loggedMessage).not.toContain('123');
      expect(loggedMessage).not.toContain('456');
    });
  });

  describe('PII redaction', () => {
    it('should redact ssn field', () => {
      const data = { ssn: '123-45-6789' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.ssn).toBe('[REDACTED_SSN]');
    });

    it('should redact phone field', () => {
      const data = { phone: '555-123-4567' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.phone).toBe('[REDACTED_PHONE]');
    });

    it('should redact phone_number field', () => {
      const data = { phone_number: '555-987-6543' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.phone_number).toBe('[REDACTED_PHONE]');
    });

    it('should redact mobile field', () => {
      const data = { mobile: '555-111-2222' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.mobile).toBe('[REDACTED_PHONE]');
    });

    it('should redact credit_card field', () => {
      const data = { credit_card: '4111-1111-1111-1111' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.credit_card).toBe('[REDACTED_CARD]');
    });

    it('should redact cardNumber field', () => {
      const data = { cardNumber: '5500-0000-0000-0004' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.cardNumber).toBe('[REDACTED_CARD]');
    });

    it('should redact cvv field', () => {
      const data = { cvv: '123' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.cvv).toBe('[REDACTED_CARD]');
    });
  });

  describe('database and infrastructure credentials', () => {
    it('should redact database_url field', () => {
      const data = { database_url: 'postgresql://user:pass@localhost/db' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.database_url).toBe('[REDACTED]');
    });

    it('should redact db_password field', () => {
      const data = { db_password: 'db_secret_pass' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.db_password).toBe('[REDACTED_PASSWORD]');
    });

    it('should redact credential field', () => {
      const data = { credential: 'some_credential' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.credential).toBe('[REDACTED_CREDENTIAL]');
    });

    it('should redact credentials field', () => {
      const data = { credentials: { username: 'admin', password: 'pass' } };
      const sanitized = logger.sanitize(data);
      expect(sanitized.credentials).toBe('[REDACTED_CREDENTIAL]');
    });
  });

  describe('stack trace removal in production', () => {
    it('should remove stack traces in production mode', () => {
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at TestFunction\n    at AnotherFunction';

      const sanitized = logger.sanitize(error);

      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).toBe('Test error');
      expect(sanitized.stack).toBeUndefined();
    });

    it('should keep stack traces in development mode', () => {
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at TestFunction';

      const sanitized = logger.sanitize(error);

      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).toBe('Test error');
      expect(sanitized.stack).toBeDefined();
      expect(sanitized.stack).toContain('TestFunction');
    });

    it('should truncate very long stack traces in development', () => {
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n' + 'a'.repeat(3000);

      const sanitized = logger.sanitize(error);

      expect(sanitized.stack).toBeDefined();
      expect(sanitized.stack.length).toBeLessThan(2100);
      expect(sanitized.stack).toContain('[truncated]');
    });

    it('should redact stack field in objects in production', () => {
      process.env.NODE_ENV = 'production';

      const data = {
        stack: 'Error stack trace here',
        message: 'Error message'
      };

      const sanitized = logger.sanitize(data);

      expect(sanitized.stack).toBe('[REDACTED_STACK]');
      expect(sanitized.message).toBe('Error message');
    });

    it('should log errors without stack traces in production', () => {
      process.env.NODE_ENV = 'production';

      const error = new Error('Production error');
      error.stack = 'Error: Production error\n    at somewhere';

      logger.error('An error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][1];
      expect(loggedMessage).toContain('Production error');
      expect(loggedMessage).not.toContain('at somewhere');
    });

    it('should log errors with stack traces in development', () => {
      process.env.NODE_ENV = 'development';

      const error = new Error('Development error');
      error.stack = 'Error: Development error\n    at testFunction';

      logger.error('An error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][1];
      expect(loggedMessage).toContain('Development error');
      expect(loggedMessage).toContain('testFunction');
    });
  });

  describe('nested object sanitization', () => {
    it('should sanitize deeply nested objects', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              email: 'nested@example.com',
              password: 'secret123',
              normalField: 'keep this'
            }
          }
        }
      };

      const sanitized = logger.sanitize(data);

      expect(sanitized.level1.level2.level3.email).toBe('[REDACTED_EMAIL]');
      expect(sanitized.level1.level2.level3.password).toBe('[REDACTED_PASSWORD]');
      expect(sanitized.level1.level2.level3.normalField).toBe('keep this');
    });

    it('should sanitize arrays of objects', () => {
      const data = {
        users: [
          { email: 'user1@example.com', name: 'User 1' },
          { email: 'user2@example.com', name: 'User 2' }
        ]
      };

      const sanitized = logger.sanitize(data);

      expect(sanitized.users[0].email).toBe('[REDACTED_EMAIL]');
      expect(sanitized.users[0].name).toBe('User 1');
      expect(sanitized.users[1].email).toBe('[REDACTED_EMAIL]');
      expect(sanitized.users[1].name).toBe('User 2');
    });

    it('should handle mixed nested structures', () => {
      const data = {
        request: {
          headers: {
            authorization: 'Bearer token123'
          },
          body: {
            user: {
              email: 'test@example.com',
              userId: 123
            }
          }
        }
      };

      const sanitized = logger.sanitize(data);

      expect(sanitized.request.headers.authorization).toBe('[REDACTED_CREDENTIAL]');
      expect(sanitized.request.body.user.email).toBe('[REDACTED_EMAIL]');
      expect(sanitized.request.body.user.userId).toBe('[REDACTED_ID]');
    });
  });

  describe('edge cases', () => {
    it('should handle null values', () => {
      const sanitized = logger.sanitize(null);
      expect(sanitized).toBeNull();
    });

    it('should handle undefined values', () => {
      const sanitized = logger.sanitize(undefined);
      expect(sanitized).toBeUndefined();
    });

    it('should handle empty strings', () => {
      const data = { message: '' };
      const sanitized = logger.sanitize(data);
      expect(sanitized.message).toBe('');
    });

    it('should handle empty objects', () => {
      const sanitized = logger.sanitize({});
      expect(sanitized).toEqual({});
    });

    it('should handle empty arrays', () => {
      const sanitized = logger.sanitize([]);
      expect(sanitized).toEqual([]);
    });

    it('should handle boolean values', () => {
      const data = { active: true, deleted: false };
      const sanitized = logger.sanitize(data);
      expect(sanitized.active).toBe(true);
      expect(sanitized.deleted).toBe(false);
    });

    it('should handle numbers', () => {
      const data = { count: 42, price: 99.99 };
      const sanitized = logger.sanitize(data);
      expect(sanitized.count).toBe(42);
      expect(sanitized.price).toBe(99.99);
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const data = { createdAt: date };
      const sanitized = logger.sanitize(data);
      expect(sanitized.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should preserve non-sensitive data', () => {
      const data = {
        id: 1,
        name: 'John Doe',
        role: 'admin',
        active: true,
        metadata: {
          lastLogin: '2024-01-01',
          preferences: {
            theme: 'dark',
            language: 'en'
          }
        }
      };

      const sanitized = logger.sanitize(data);

      expect(sanitized.id).toBe(1);
      expect(sanitized.name).toBe('John Doe');
      expect(sanitized.role).toBe('admin');
      expect(sanitized.active).toBe(true);
      expect(sanitized.metadata.lastLogin).toBe('2024-01-01');
      expect(sanitized.metadata.preferences.theme).toBe('dark');
      expect(sanitized.metadata.preferences.language).toBe('en');
    });
  });

  describe('log levels', () => {
    it('should support debug level', () => {
      process.env.NODE_ENV = 'development';
      logger.debug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[DEBUG]');
    });

    it('should support info level', () => {
      logger.info('Info message');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[INFO]');
    });

    it('should support warn level', () => {
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
    });

    it('should support error level', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should include timestamp in logs', () => {
      logger.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const logPrefix = consoleLogSpy.mock.calls[0][0];
      // Check for ISO timestamp format
      expect(logPrefix).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it('should sanitize multiple arguments', () => {
      logger.info('User action', { email: 'test@example.com' }, { token: 'abc123' });
      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedMessage = consoleLogSpy.mock.calls[0][1];
      expect(loggedMessage).toContain('[REDACTED_EMAIL]');
      expect(loggedMessage).toContain('[REDACTED_TOKEN]');
    });
  });

  describe('complex real-world scenarios', () => {
    it('should sanitize typical authentication request', () => {
      const authRequest = {
        body: {
          email: 'user@example.com',
          password: 'SecretP@ss123'
        },
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0'
        }
      };

      const sanitized = logger.sanitize(authRequest);

      expect(sanitized.body.email).toBe('[REDACTED_EMAIL]');
      expect(sanitized.body.password).toBe('[REDACTED_PASSWORD]');
      expect(sanitized.headers['content-type']).toBe('application/json');
      expect(sanitized.headers['user-agent']).toBe('Mozilla/5.0');
    });

    it('should sanitize typical API response with user data', () => {
      const apiResponse = {
        user: {
          user_id: 123,
          team_id: 456,
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin'
        },
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
        expiresIn: 3600
      };

      const sanitized = logger.sanitize(apiResponse);

      expect(sanitized.user.user_id).toBe('[REDACTED_ID]');
      expect(sanitized.user.team_id).toBe('[REDACTED_ID]');
      expect(sanitized.user.email).toBe('[REDACTED_EMAIL]');
      expect(sanitized.user.name).toBe('Admin User');
      expect(sanitized.user.role).toBe('admin');
      expect(sanitized.token).toBe('[REDACTED_TOKEN]');
      expect(sanitized.expiresIn).toBe(3600);
    });

    it('should sanitize database connection error', () => {
      const dbError = new Error('Connection failed');
      dbError.code = 'ECONNREFUSED';
      dbError.config = {
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        password: 'db_secret_password'
      };

      const sanitized = logger.sanitize(dbError);

      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).toBe('Connection failed');
      expect(sanitized.code).toBe('ECONNREFUSED');
      expect(sanitized.config.host).toBe('localhost');
      expect(sanitized.config.port).toBe(5432);
      expect(sanitized.config.database).toBe('mydb');
      expect(sanitized.config.password).toBe('[REDACTED_PASSWORD]');
    });

    it('should sanitize request with authorization header', () => {
      const request = {
        method: 'POST',
        url: '/api/users',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token',
          apiKey: 'sk_live_1234567890'
        },
        user: {
          userId: 789,
          email: 'request@example.com'
        }
      };

      const sanitized = logger.sanitize(request);

      expect(sanitized.method).toBe('POST');
      expect(sanitized.url).toBe('/api/users');
      expect(sanitized.headers.authorization).toBe('[REDACTED_CREDENTIAL]');
      expect(sanitized.headers.apiKey).toBe('[REDACTED_KEY]');
      expect(sanitized.user.userId).toBe('[REDACTED_ID]');
      expect(sanitized.user.email).toBe('[REDACTED_EMAIL]');
    });
  });

  describe('sanitize method', () => {
    it('should be accessible as a public method', () => {
      expect(typeof logger.sanitize).toBe('function');
    });

    it('should return sanitized data without logging', () => {
      consoleLogSpy.mockClear();
      const data = { email: 'test@example.com' };
      const sanitized = logger.sanitize(data);

      expect(sanitized.email).toBe('[REDACTED_EMAIL]');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should allow manual sanitization before passing to other systems', () => {
      const userData = {
        user_id: 123,
        email: 'user@example.com',
        name: 'Test User'
      };

      const sanitized = logger.sanitize(userData);

      // Can now safely pass sanitized data to monitoring systems, etc.
      expect(sanitized.user_id).toBe('[REDACTED_ID]');
      expect(sanitized.email).toBe('[REDACTED_EMAIL]');
      expect(sanitized.name).toBe('Test User');
    });
  });
});

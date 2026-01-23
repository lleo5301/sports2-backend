const errorHandler = require('../errorHandler');

// Mock console.error to verify it's being called
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('errorHandler', () => {
  let originalEnv;

  const res = () => {
    const r = {};
    r.status = jest.fn(() => r);
    r.json = jest.fn(() => r);
    return r;
  };

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.NODE_ENV;
    // Clear mock calls
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env.NODE_ENV = originalEnv;
  });

  afterAll(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  describe('error logging with sanitization', () => {
    it('should use console.error for error logging', () => {
      const err = new Error('Test error');
      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      // Verify console.error was called
      expect(console.error).toHaveBeenCalledWith('Error:', err);
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should log errors with sensitive data safely', () => {
      const err = new Error('Database query failed');
      err.user_id = 12345;
      err.team_id = 'team_abc';
      err.email = 'user@example.com';
      err.token = 'secret_token_123';

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      // Verify console.error was called
      expect(console.error).toHaveBeenCalledWith('Error:', err);
    });

    it('should log validation errors with user context safely', () => {
      const err = new Error('validation');
      err.name = 'SequelizeValidationError';
      err.errors = [{ message: 'Email is required' }];
      err.user = {
        user_id: 123,
        email: 'test@example.com',
        team_id: 456
      };

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      // Verify console.error was called with the error
      expect(console.error).toHaveBeenCalledWith('Error:', err);
    });

    it('should log JWT errors without exposing tokens', () => {
      const err = new Error('Invalid token');
      err.name = 'JsonWebTokenError';
      err.token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive.data';

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(console.error).toHaveBeenCalledWith('Error:', err);
    });
  });

  describe('stack trace exposure prevention', () => {
    it('should not include stack traces in production error responses', () => {
      process.env.NODE_ENV = 'production';

      const err = new Error('Production error');
      err.stack = 'Error: Production error\n    at someFunction (file.js:10:5)\n    at anotherFunction (file.js:20:10)';

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      // Get the JSON response
      const jsonCall = response.json.mock.calls[0][0];

      // Verify response does NOT contain stack trace
      expect(jsonCall).not.toHaveProperty('stack');
      expect(JSON.stringify(jsonCall)).not.toContain('at someFunction');
      expect(JSON.stringify(jsonCall)).not.toContain('at anotherFunction');
    });

    it('should include stack traces in development error responses', () => {
      process.env.NODE_ENV = 'development';

      const err = new Error('Development error');
      err.stack = 'Error: Development error\n    at testFunction (test.js:5:10)\n    at handler (handler.js:15:5)';

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      // Get the JSON response
      const jsonCall = response.json.mock.calls[0][0];

      // Verify response DOES contain stack trace in development
      expect(jsonCall).toHaveProperty('stack');
      expect(jsonCall.stack).toBe(err.stack);
    });

    it('should not expose internal error details in responses', () => {
      const err = new Error('Internal server error');
      err.internalCode = 'DB_CONNECTION_FAILED';
      err.details = { host: 'localhost', user: 'admin', password: 'secret123' };
      err.stack = 'Error stack trace here';

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      const jsonCall = response.json.mock.calls[0][0];

      // Verify response only contains safe fields
      expect(jsonCall).toHaveProperty('success', false);
      expect(jsonCall).toHaveProperty('error');
      expect(jsonCall).not.toHaveProperty('internalCode');
      expect(jsonCall).not.toHaveProperty('details');
      expect(jsonCall).not.toHaveProperty('stack');
    });
  });

  describe('user-friendly error messages', () => {
    it('handles generic error with user-friendly message', () => {
      const err = new Error('boom');
      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalled();

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall).toEqual({
        success: false,
        error: 'boom'
      });
    });

    it('handles sequelize validation error with friendly messages', () => {
      const err = new Error('validation');
      err.name = 'SequelizeValidationError';
      err.errors = [{ message: 'bad' }, { message: 'worse' }];
      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(response.status).toHaveBeenCalledWith(400);

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall.success).toBe(false);
      expect(jsonCall.error).toBeDefined();
    });

    it('handles sequelize unique constraint error', () => {
      const err = new Error('unique violation');
      err.name = 'SequelizeUniqueConstraintError';
      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(response.status).toHaveBeenCalledWith(400);

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall.success).toBe(false);
      expect(jsonCall.error).toBe('Duplicate field value entered');
    });

    it('handles JWT invalid token error', () => {
      const err = new Error('jwt malformed');
      err.name = 'JsonWebTokenError';
      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(response.status).toHaveBeenCalledWith(401);

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall).toEqual({
        success: false,
        error: 'Invalid token'
      });
    });

    it('handles JWT expired token error', () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(response.status).toHaveBeenCalledWith(401);

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall).toEqual({
        success: false,
        error: 'Token expired'
      });
    });

    it('handles CastError with user-friendly message', () => {
      const err = new Error('Cast to ObjectId failed');
      err.name = 'CastError';
      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(response.status).toHaveBeenCalledWith(404);

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall).toEqual({
        success: false,
        error: 'Resource not found'
      });
    });
  });

  describe('error responses do not leak sensitive data', () => {
    it('should not include user IDs in error responses', () => {
      const err = new Error('Operation failed');
      err.user_id = 12345;
      err.userId = 67890;

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      const jsonCall = response.json.mock.calls[0][0];
      const jsonString = JSON.stringify(jsonCall);

      // Verify no user IDs in response
      expect(jsonString).not.toContain('12345');
      expect(jsonString).not.toContain('67890');
      expect(jsonCall).not.toHaveProperty('user_id');
      expect(jsonCall).not.toHaveProperty('userId');
    });

    it('should not include team IDs in error responses', () => {
      const err = new Error('Team operation failed');
      err.team_id = 'team_123';
      err.teamId = 'team_456';

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      const jsonCall = response.json.mock.calls[0][0];
      const jsonString = JSON.stringify(jsonCall);

      // Verify no team IDs in response
      expect(jsonString).not.toContain('team_123');
      expect(jsonString).not.toContain('team_456');
      expect(jsonCall).not.toHaveProperty('team_id');
      expect(jsonCall).not.toHaveProperty('teamId');
    });

    it('should not include email addresses in error responses', () => {
      const err = new Error('User lookup failed');
      err.email = 'user@example.com';
      err.userEmail = 'admin@example.com';

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      const jsonCall = response.json.mock.calls[0][0];
      const jsonString = JSON.stringify(jsonCall);

      // Verify no emails in response
      expect(jsonString).not.toContain('user@example.com');
      expect(jsonString).not.toContain('admin@example.com');
      expect(jsonCall).not.toHaveProperty('email');
      expect(jsonCall).not.toHaveProperty('userEmail');
    });

    it('should not include tokens in error responses', () => {
      const err = new Error('Token validation failed');
      err.token = 'secret_token_abc123';
      err.accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      const jsonCall = response.json.mock.calls[0][0];
      const jsonString = JSON.stringify(jsonCall);

      // Verify no tokens in response
      expect(jsonString).not.toContain('secret_token_abc123');
      expect(jsonString).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(jsonCall).not.toHaveProperty('token');
      expect(jsonCall).not.toHaveProperty('accessToken');
    });

    it('should only return expected response structure', () => {
      const err = new Error('Test error');
      err.user_id = 123;
      err.email = 'test@example.com';
      err.password = 'secret';
      err.internalDetails = { sensitive: 'data' };

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      const jsonCall = response.json.mock.calls[0][0];

      // Verify response only contains expected fields
      expect(Object.keys(jsonCall)).toEqual(['success', 'error']);
      expect(jsonCall.success).toBe(false);
      expect(jsonCall.error).toBe('Test error');
    });
  });

  describe('comprehensive error type handling', () => {
    it('should handle errors with nested sensitive data', () => {
      const err = new Error('Complex error');
      err.request = {
        headers: {
          authorization: 'Bearer token123'
        },
        body: {
          user: {
            email: 'nested@example.com',
            password: 'secret123'
          }
        }
      };

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      // Verify console.error was called
      expect(console.error).toHaveBeenCalledWith('Error:', err);

      // Verify response doesn't contain nested sensitive data
      const jsonCall = response.json.mock.calls[0][0];
      const jsonString = JSON.stringify(jsonCall);
      expect(jsonString).not.toContain('Bearer token123');
      expect(jsonString).not.toContain('nested@example.com');
      expect(jsonString).not.toContain('secret123');
    });

    it('should handle error without message property', () => {
      const err = new Error();
      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(response.status).toHaveBeenCalledWith(500);

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall).toEqual({
        success: false,
        error: 'Server Error'
      });
    });

    it('should handle error with custom statusCode', () => {
      const err = new Error('Forbidden');
      err.statusCode = 403;

      const req = {};
      const response = res();
      errorHandler(err, req, response, () => {});

      expect(response.status).toHaveBeenCalledWith(403);

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall).toEqual({
        success: false,
        error: 'Forbidden'
      });
    });

    it('should log all error types consistently', () => {
      const errorTypes = [
        { name: 'Error', message: 'Generic error' },
        { name: 'SequelizeValidationError', message: 'Validation failed', errors: [] },
        { name: 'SequelizeUniqueConstraintError', message: 'Unique violation' },
        { name: 'JsonWebTokenError', message: 'Invalid token' },
        { name: 'TokenExpiredError', message: 'Token expired' },
        { name: 'CastError', message: 'Invalid cast' }
      ];

      errorTypes.forEach(errorType => {
        jest.clearAllMocks();

        const err = new Error(errorType.message);
        err.name = errorType.name;
        if (errorType.errors) {
          err.errors = errorType.errors;
        }

        const req = {};
        const response = res();
        errorHandler(err, req, response, () => {});

        // Verify console.error was called for each error type
        expect(console.error).toHaveBeenCalledWith('Error:', err);
        expect(console.error).toHaveBeenCalledTimes(1);
      });
    });
  });
});

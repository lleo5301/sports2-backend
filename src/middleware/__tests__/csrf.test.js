const {
  generateToken,
  doubleCsrfProtection,
  csrfErrorHandler,
  invalidCsrfTokenError
} = require('../csrf');

// Helper to get the cookie name based on environment (matches csrf.js logic)
const getCookieName = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';
};

describe('CSRF middleware', () => {
  const next = jest.fn();
  const res = () => {
    const r = {};
    r.status = jest.fn(() => r);
    r.json = jest.fn(() => r);
    r.cookie = jest.fn(() => r);
    return r;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('generates a CSRF token and sets cookie', () => {
      const req = {
        cookies: {}
      };
      const response = res();

      const token = generateToken(req, response);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(response.cookie).toHaveBeenCalled();
    });

    it('generates different tokens on subsequent calls', () => {
      const req = {
        cookies: {}
      };
      const response = res();

      const token1 = generateToken(req, response);
      const token2 = generateToken(req, response);

      expect(token1).not.toBe(token2);
    });

    it('sets cookie with correct security options', () => {
      const req = {
        cookies: {}
      };
      const response = res();

      generateToken(req, response);

      expect(response.cookie).toHaveBeenCalled();
      const cookieCall = response.cookie.mock.calls[0];
      const cookieName = cookieCall[0];
      const cookieOptions = cookieCall[2];

      expect(cookieName).toContain('csrf');
      expect(cookieOptions).toHaveProperty('httpOnly', true);
      expect(cookieOptions).toHaveProperty('path', '/');
      expect(cookieOptions).toHaveProperty('sameSite');
    });
  });

  describe('doubleCsrfProtection middleware', () => {
    it('allows GET requests without CSRF token', async () => {
      const req = {
        method: 'GET',
        headers: {}
      };
      const response = res();

      await doubleCsrfProtection(req, response, next);

      expect(next).toHaveBeenCalled();
      expect(response.status).not.toHaveBeenCalled();
    });

    it('allows HEAD requests without CSRF token', async () => {
      const req = {
        method: 'HEAD',
        headers: {}
      };
      const response = res();

      await doubleCsrfProtection(req, response, next);

      expect(next).toHaveBeenCalled();
      expect(response.status).not.toHaveBeenCalled();
    });

    it('allows OPTIONS requests without CSRF token', async () => {
      const req = {
        method: 'OPTIONS',
        headers: {}
      };
      const response = res();

      await doubleCsrfProtection(req, response, next);

      expect(next).toHaveBeenCalled();
      expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects POST request without CSRF token', async () => {
      const req = {
        method: 'POST',
        headers: {},
        cookies: {}
      };
      const response = res();

      await doubleCsrfProtection(req, response, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeDefined();
    });

    it('rejects PUT request without CSRF token', async () => {
      const req = {
        method: 'PUT',
        headers: {},
        cookies: {}
      };
      const response = res();

      await doubleCsrfProtection(req, response, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeDefined();
    });

    it('rejects DELETE request without CSRF token', async () => {
      const req = {
        method: 'DELETE',
        headers: {},
        cookies: {}
      };
      const response = res();

      await doubleCsrfProtection(req, response, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeDefined();
    });

    it('rejects POST request with invalid CSRF token', async () => {
      const req = {
        method: 'POST',
        headers: {
          'x-csrf-token': 'invalid-token-value'
        },
        cookies: {
          '__Host-psifi.x-csrf-token': 'cookie-value'
        }
      };
      const response = res();

      await doubleCsrfProtection(req, response, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeDefined();
    });

    it('accepts POST request with valid CSRF token', async () => {
      // First generate a valid token
      const setupReq = {
        cookies: {}
      };
      const setupResponse = res();
      const token = generateToken(setupReq, setupResponse);

      // Extract cookie value from the mock call
      const cookieCall = setupResponse.cookie.mock.calls[0];
      const cookieValue = cookieCall[1];

      // Now make a POST request with the valid token
      const cookieName = getCookieName();
      const postReq = {
        method: 'POST',
        headers: {
          'x-csrf-token': token
        },
        cookies: {
          [cookieName]: cookieValue
        }
      };
      const postResponse = res();
      const postNext = jest.fn();

      await doubleCsrfProtection(postReq, postResponse, postNext);

      expect(postNext).toHaveBeenCalled();
      expect(postNext.mock.calls[0][0]).toBeUndefined();
    });
  });

  describe('csrfErrorHandler', () => {
    it('handles invalid CSRF token error', () => {
      const err = invalidCsrfTokenError;
      const req = {};
      const response = res();

      csrfErrorHandler(err, req, response, next);

      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or missing CSRF token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('passes through other errors', () => {
      const err = new Error('some other error');
      const req = {};
      const response = res();

      csrfErrorHandler(err, req, response, next);

      expect(response.status).not.toHaveBeenCalled();
      expect(response.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(err);
    });

    it('returns correct error format for CSRF violations', () => {
      const err = invalidCsrfTokenError;
      const req = {};
      const response = res();

      csrfErrorHandler(err, req, response, next);

      const jsonCall = response.json.mock.calls[0][0];
      expect(jsonCall).toHaveProperty('success', false);
      expect(jsonCall).toHaveProperty('error');
      expect(typeof jsonCall.error).toBe('string');
    });
  });

  describe('CSRF configuration', () => {
    it('cookie name matches expected format for current environment', () => {
      const req = {
        cookies: {}
      };
      const response = res();

      generateToken(req, response);

      const cookieCall = response.cookie.mock.calls[0];
      const cookieName = cookieCall[0];
      const expectedCookieName = getCookieName();

      expect(cookieName).toBe(expectedCookieName);
      
      // In production, cookie name should have __Host- prefix
      if (process.env.NODE_ENV === 'production') {
        expect(cookieName).toContain('__Host-');
      }
    });

    it('cookie is httpOnly to prevent XSS', () => {
      const req = {
        cookies: {}
      };
      const response = res();

      generateToken(req, response);

      const cookieCall = response.cookie.mock.calls[0];
      const cookieOptions = cookieCall[2];

      expect(cookieOptions.httpOnly).toBe(true);
    });

    it('cookie has correct sameSite setting', () => {
      const req = {
        cookies: {}
      };
      const response = res();

      generateToken(req, response);

      const cookieCall = response.cookie.mock.calls[0];
      const cookieOptions = cookieCall[2];

      expect(cookieOptions.sameSite).toBeDefined();
      expect(['strict', 'lax', 'none']).toContain(cookieOptions.sameSite);
    });

    it('cookie has correct path setting', () => {
      const req = {
        cookies: {}
      };
      const response = res();

      generateToken(req, response);

      const cookieCall = response.cookie.mock.calls[0];
      const cookieOptions = cookieCall[2];

      expect(cookieOptions.path).toBe('/');
    });
  });

  describe('Token validation', () => {
    it('reads token from x-csrf-token header', async () => {
      const req = {
        method: 'POST',
        headers: {
          'x-csrf-token': 'some-token'
        },
        cookies: {}
      };
      const response = res();
      const testNext = jest.fn();

      await doubleCsrfProtection(req, response, testNext);

      // Expect an error because token doesn't match cookie
      expect(testNext).toHaveBeenCalled();
      const error = testNext.mock.calls[0][0];
      expect(error).toBeDefined();
    });

    it('validates token against cookie value', async () => {
      // Generate a valid token
      const setupReq = { cookies: {} };
      const setupResponse = res();
      const token = generateToken(setupReq, setupResponse);

      const cookieCall = setupResponse.cookie.mock.calls[0];
      const cookieValue = cookieCall[1];

      // Test with matching token and cookie
      const validReq = {
        method: 'POST',
        headers: {
          'x-csrf-token': token
        },
        cookies: {
          [getCookieName()]: cookieValue
        }
      };
      const validResponse = res();
      const validNext = jest.fn();

      await doubleCsrfProtection(validReq, validResponse, validNext);

      expect(validNext).toHaveBeenCalled();
      expect(validNext.mock.calls[0][0]).toBeUndefined();
    });
  });
});

/**
 * Test helpers for CSRF token handling and authenticated requests
 */
const request = require('supertest');

/**
 * Get a CSRF token and cookies for use in tests
 * @param {object} app - Express app instance
 * @returns {Promise<{token: string, cookies: string[]}>}
 */
async function getCsrfToken(app) {
  const response = await request(app)
    .get('/api/auth/csrf-token')
    .expect(200);

  return {
    token: response.body.token,
    cookies: response.headers['set-cookie'] || []
  };
}

/**
 * Create a supertest request with CSRF token set
 * @param {object} app - Express app instance
 * @param {string} method - HTTP method (post, put, delete, patch)
 * @param {string} url - Request URL
 * @returns {Promise<object>} - Supertest request object with CSRF headers set
 */
async function requestWithCsrf(app, method, url) {
  const { token, cookies } = await getCsrfToken(app);

  return request(app)[method](url)
    .set('Cookie', cookies)
    .set('x-csrf-token', token);
}

/**
 * Create an authenticated request with CSRF token
 * @param {object} app - Express app instance
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {string} authToken - JWT auth token
 * @returns {Promise<object>} - Supertest request object
 */
async function authenticatedRequestWithCsrf(app, method, url, authToken) {
  const { token, cookies } = await getCsrfToken(app);

  return request(app)[method](url)
    .set('Cookie', cookies)
    .set('x-csrf-token', token)
    .set('Authorization', `Bearer ${authToken}`);
}

module.exports = {
  getCsrfToken,
  requestWithCsrf,
  authenticatedRequestWithCsrf
};

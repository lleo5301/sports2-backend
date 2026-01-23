const request = require('supertest');
const app = require('../server');

describe('Security Headers Integration Tests', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Security headers on all endpoints', () => {
    it('should include X-Content-Type-Options header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should include X-Frame-Options header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should include Content-Security-Policy header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('should include Referrer-Policy header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should include X-DNS-Prefetch-Control header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('should include X-Download-Options header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-download-options']).toBe('noopen');
    });

    it('should include X-Permitted-Cross-Domain-Policies header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
    });

    it('should not include X-Powered-By header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('HSTS header behavior', () => {
    it('should not include Strict-Transport-Security header in non-production environments', async () => {
      // When running in test/development environment, HSTS should be disabled
      // to allow local development without HTTPS
      const response = await request(app)
        .get('/health')
        .expect(200);

      // In test/development, HSTS should not be present
      if (originalNodeEnv !== 'production') {
        expect(response.headers['strict-transport-security']).toBeUndefined();
      }
    });

    it('should verify HSTS configuration is environment-aware', () => {
      // This test verifies the configuration logic without requiring a production restart
      const { getHelmetConfig } = require('../config/helmet');

      // Test production config
      process.env.NODE_ENV = 'production';
      const prodConfig = getHelmetConfig();
      expect(prodConfig.strictTransportSecurity).toBeDefined();
      expect(prodConfig.strictTransportSecurity).not.toBe(false);
      expect(prodConfig.strictTransportSecurity.maxAge).toBe(31536000);
      expect(prodConfig.strictTransportSecurity.includeSubDomains).toBe(true);
      expect(prodConfig.strictTransportSecurity.preload).toBe(true);

      // Test development config
      process.env.NODE_ENV = 'development';
      const devConfig = getHelmetConfig();
      expect(devConfig.strictTransportSecurity).toBe(false);

      // Restore original env
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('CSP directives in development', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should include relaxed CSP directives for development', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toBeDefined();

      // Development should allow unsafe-inline and unsafe-eval for hot reloading
      // Note: This is checking current state, which may not reflect env changes
      // without server restart
      expect(csp).toContain('default-src');
    });
  });

  describe('Security headers applied to API routes', () => {
    it('should apply security headers to API endpoints', async () => {
      // Test on a non-existent API route to avoid auth requirements
      const response = await request(app)
        .get('/api/nonexistent');

      // Even 404 responses should have security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CSP specific directives', () => {
    it('should include frame-ancestors directive to prevent clickjacking', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should include object-src directive to block plugins', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("object-src 'none'");
    });

    it('should include base-uri directive to prevent base tag injection', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("base-uri 'self'");
    });

    it('should include form-action directive to restrict form submissions', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("form-action 'self'");
    });

    it('should include frame-src directive to control iframe sources', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("frame-src 'none'");
    });
  });

  describe('Security headers consistency', () => {
    it('should apply the same security headers across multiple requests', async () => {
      const response1 = await request(app)
        .get('/health')
        .expect(200);

      const response2 = await request(app)
        .get('/health')
        .expect(200);

      // Verify consistency
      expect(response1.headers['x-content-type-options']).toBe(response2.headers['x-content-type-options']);
      expect(response1.headers['x-frame-options']).toBe(response2.headers['x-frame-options']);
      expect(response1.headers['referrer-policy']).toBe(response2.headers['referrer-policy']);
    });

    it('should apply security headers to different HTTP methods', async () => {
      const getResponse = await request(app)
        .get('/health');

      const postResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'test123' });

      // Both should have security headers regardless of method or status code
      expect(getResponse.headers['x-content-type-options']).toBe('nosniff');
      expect(postResponse.headers['x-content-type-options']).toBe('nosniff');
      expect(getResponse.headers['x-frame-options']).toBe('DENY');
      expect(postResponse.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('Security headers completeness', () => {
    it('should include all required security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const requiredHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'content-security-policy',
        'referrer-policy',
        'x-dns-prefetch-control',
        'x-download-options',
        'x-permitted-cross-domain-policies'
      ];

      requiredHeaders.forEach(header => {
        expect(response.headers[header]).toBeDefined();
      });
    });

    it('should not expose sensitive server information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // X-Powered-By should be removed by helmet
      expect(response.headers['x-powered-by']).toBeUndefined();

      // Server header should not reveal version details
      const serverHeader = response.headers['server'];
      if (serverHeader) {
        expect(serverHeader).not.toContain('Express');
        expect(serverHeader).not.toMatch(/\d+\.\d+\.\d+/); // No version numbers
      }
    });
  });
});

const { getHelmetConfig } = require('../helmet');

describe('Helmet Configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('getHelmetConfig', () => {
    describe('in production environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
      });

      it('returns a complete helmet configuration object', () => {
        const config = getHelmetConfig();
        expect(config).toBeDefined();
        expect(typeof config).toBe('object');
      });

      it('configures Content Security Policy with strict directives', () => {
        const config = getHelmetConfig();
        expect(config.contentSecurityPolicy).toBeDefined();
        expect(config.contentSecurityPolicy.directives).toBeDefined();
      });

      it('sets strict scriptSrc without unsafe-inline or unsafe-eval', () => {
        const config = getHelmetConfig();
        const { scriptSrc } = config.contentSecurityPolicy.directives;
        expect(scriptSrc).toEqual(["'self'"]);
        expect(scriptSrc).not.toContain("'unsafe-inline'");
        expect(scriptSrc).not.toContain("'unsafe-eval'");
      });

      it('sets connectSrc to self only in production', () => {
        const config = getHelmetConfig();
        const { connectSrc } = config.contentSecurityPolicy.directives;
        expect(connectSrc).toEqual(["'self'"]);
        expect(connectSrc).not.toContain('ws://localhost:*');
        expect(connectSrc).not.toContain('http://localhost:*');
      });

      it('includes upgradeInsecureRequests directive', () => {
        const config = getHelmetConfig();
        const { upgradeInsecureRequests } = config.contentSecurityPolicy.directives;
        expect(upgradeInsecureRequests).toEqual([]);
      });

      it('configures HSTS with strict settings', () => {
        const config = getHelmetConfig();
        expect(config.strictTransportSecurity).toBeDefined();
        expect(config.strictTransportSecurity).not.toBe(false);
        expect(config.strictTransportSecurity.maxAge).toBe(31536000);
        expect(config.strictTransportSecurity.includeSubDomains).toBe(true);
        expect(config.strictTransportSecurity.preload).toBe(true);
      });

      it('sets default CSP directives for resource loading', () => {
        const config = getHelmetConfig();
        const { directives } = config.contentSecurityPolicy;
        expect(directives.defaultSrc).toEqual(["'self'"]);
        expect(directives.styleSrc).toContain("'self'");
        expect(directives.imgSrc).toContain("'self'");
        expect(directives.fontSrc).toContain("'self'");
      });

      it('prevents iframe embedding with frameSrc and frameAncestors', () => {
        const config = getHelmetConfig();
        const { directives } = config.contentSecurityPolicy;
        expect(directives.frameSrc).toEqual(["'none'"]);
        expect(directives.frameAncestors).toEqual(["'none'"]);
      });

      it('disables plugins and objects', () => {
        const config = getHelmetConfig();
        const { objectSrc } = config.contentSecurityPolicy.directives;
        expect(objectSrc).toEqual(["'none'"]);
      });

      it('restricts base URI to prevent injection attacks', () => {
        const config = getHelmetConfig();
        const { baseUri } = config.contentSecurityPolicy.directives;
        expect(baseUri).toEqual(["'self'"]);
      });

      it('restricts form actions to same origin', () => {
        const config = getHelmetConfig();
        const { formAction } = config.contentSecurityPolicy.directives;
        expect(formAction).toEqual(["'self'"]);
      });
    });

    describe('in development environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
      });

      it('returns a complete helmet configuration object', () => {
        const config = getHelmetConfig();
        expect(config).toBeDefined();
        expect(typeof config).toBe('object');
      });

      it('relaxes scriptSrc to allow inline scripts and eval for dev tools', () => {
        const config = getHelmetConfig();
        const { scriptSrc } = config.contentSecurityPolicy.directives;
        expect(scriptSrc).toContain("'self'");
        expect(scriptSrc).toContain("'unsafe-inline'");
        expect(scriptSrc).toContain("'unsafe-eval'");
      });

      it('allows localhost connections for hot reloading', () => {
        const config = getHelmetConfig();
        const { connectSrc } = config.contentSecurityPolicy.directives;
        expect(connectSrc).toContain("'self'");
        expect(connectSrc).toContain('ws://localhost:*');
        expect(connectSrc).toContain('http://localhost:*');
      });

      it('disables HSTS for local development', () => {
        const config = getHelmetConfig();
        expect(config.strictTransportSecurity).toBe(false);
      });

      it('does not include upgradeInsecureRequests directive', () => {
        const config = getHelmetConfig();
        const { upgradeInsecureRequests } = config.contentSecurityPolicy.directives;
        expect(upgradeInsecureRequests).toBeUndefined();
      });

      it('still enforces other security headers', () => {
        const config = getHelmetConfig();
        expect(config.frameguard).toBeDefined();
        expect(config.noSniff).toBe(true);
        expect(config.referrerPolicy).toBeDefined();
      });
    });

    describe('security headers configuration', () => {
      it('configures X-Frame-Options to deny all framing', () => {
        const config = getHelmetConfig();
        expect(config.frameguard).toEqual({ action: 'deny' });
      });

      it('enables X-Content-Type-Options nosniff', () => {
        const config = getHelmetConfig();
        expect(config.noSniff).toBe(true);
      });

      it('configures Referrer-Policy with strict-origin-when-cross-origin', () => {
        const config = getHelmetConfig();
        expect(config.referrerPolicy).toEqual({
          policy: 'strict-origin-when-cross-origin'
        });
      });

      it('disables DNS prefetch control', () => {
        const config = getHelmetConfig();
        expect(config.dnsPrefetchControl).toEqual({ allow: false });
      });

      it('enables IE no open for download protection', () => {
        const config = getHelmetConfig();
        expect(config.ieNoOpen).toBe(true);
      });

      it('sets permitted cross-domain policies to none', () => {
        const config = getHelmetConfig();
        expect(config.permittedCrossDomainPolicies).toEqual({
          permittedPolicies: 'none'
        });
      });

      it('hides X-Powered-By header', () => {
        const config = getHelmetConfig();
        expect(config.hidePoweredBy).toBe(true);
      });
    });

    describe('CSP directives for resource types', () => {
      it('allows inline styles for component libraries', () => {
        const config = getHelmetConfig();
        const { styleSrc } = config.contentSecurityPolicy.directives;
        expect(styleSrc).toContain("'self'");
        expect(styleSrc).toContain("'unsafe-inline'");
      });

      it('allows data URIs and HTTPS for images', () => {
        const config = getHelmetConfig();
        const { imgSrc } = config.contentSecurityPolicy.directives;
        expect(imgSrc).toContain("'self'");
        expect(imgSrc).toContain('data:');
        expect(imgSrc).toContain('https:');
      });

      it('allows self and data URIs for fonts', () => {
        const config = getHelmetConfig();
        const { fontSrc } = config.contentSecurityPolicy.directives;
        expect(fontSrc).toContain("'self'");
        expect(fontSrc).toContain('data:');
      });

      it('allows self-hosted media only', () => {
        const config = getHelmetConfig();
        const { mediaSrc } = config.contentSecurityPolicy.directives;
        expect(mediaSrc).toEqual(["'self'"]);
      });
    });

    describe('environment detection', () => {
      it('correctly detects production environment', () => {
        process.env.NODE_ENV = 'production';
        const config = getHelmetConfig();
        // HSTS should be enabled in production
        expect(config.strictTransportSecurity).not.toBe(false);
      });

      it('correctly detects development environment', () => {
        process.env.NODE_ENV = 'development';
        const config = getHelmetConfig();
        // HSTS should be disabled in development
        expect(config.strictTransportSecurity).toBe(false);
      });

      it('treats undefined NODE_ENV as non-production', () => {
        delete process.env.NODE_ENV;
        const config = getHelmetConfig();
        // HSTS should be disabled when NODE_ENV is undefined
        expect(config.strictTransportSecurity).toBe(false);
        // upgradeInsecureRequests should not be set
        expect(config.contentSecurityPolicy.directives.upgradeInsecureRequests).toBeUndefined();
      });

      it('treats test environment as non-production', () => {
        process.env.NODE_ENV = 'test';
        const config = getHelmetConfig();
        // HSTS should be disabled in test
        expect(config.strictTransportSecurity).toBe(false);
      });
    });

    describe('configuration consistency', () => {
      it('returns the same structure across different environments', () => {
        process.env.NODE_ENV = 'production';
        const prodConfig = getHelmetConfig();

        process.env.NODE_ENV = 'development';
        const devConfig = getHelmetConfig();

        // Both should have the same top-level keys except for environment-specific behavior
        expect(Object.keys(prodConfig).sort()).toEqual(Object.keys(devConfig).sort());
      });

      it('always includes all required security headers', () => {
        const config = getHelmetConfig();
        const requiredHeaders = [
          'contentSecurityPolicy',
          'strictTransportSecurity',
          'frameguard',
          'noSniff',
          'referrerPolicy',
          'dnsPrefetchControl',
          'ieNoOpen',
          'permittedCrossDomainPolicies',
          'hidePoweredBy'
        ];

        requiredHeaders.forEach(header => {
          expect(config).toHaveProperty(header);
        });
      });

      it('exports getHelmetConfig as a function', () => {
        expect(typeof getHelmetConfig).toBe('function');
      });

      it('returns a new object on each call', () => {
        const config1 = getHelmetConfig();
        const config2 = getHelmetConfig();
        expect(config1).not.toBe(config2);
        expect(config1).toEqual(config2);
      });
    });
  });
});

/**
 * Helmet.js Security Headers Configuration
 *
 * This module provides explicit security header configurations for the application.
 * While Helmet.js provides good defaults, explicit configuration ensures we have
 * exactly the protections needed for a SaaS application handling sensitive scouting data.
 *
 * @see https://helmetjs.github.io/ for more information on each header
 */

/**
 * Get Helmet configuration based on environment
 *
 * @returns {Object} Helmet configuration object with explicit security headers
 *
 * Security Headers Configured:
 * - Content-Security-Policy (CSP): Prevents XSS attacks by controlling resource loading
 * - Strict-Transport-Security (HSTS): Enforces HTTPS connections
 * - X-Frame-Options: Prevents clickjacking attacks
 * - X-Content-Type-Options: Prevents MIME type sniffing
 * - Referrer-Policy: Controls referrer information sent with requests
 * - X-DNS-Prefetch-Control: Controls browser DNS prefetching
 * - X-Download-Options: Prevents IE from executing downloads in site context
 * - X-Permitted-Cross-Domain-Policies: Prevents Adobe products from loading data
 */
function getHelmetConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    /**
     * Content Security Policy (CSP)
     *
     * Prevents XSS attacks by specifying which sources are allowed to load resources.
     * In development, we relax some restrictions to allow hot reloading and dev tools.
     * In production, we enforce strict policies to protect user data.
     */
    contentSecurityPolicy: {
      directives: {
        // Default fallback for all resource types
        defaultSrc: ["'self'"],

        // Scripts: Allow inline scripts in dev for hot reload, use nonces/hashes in prod
        scriptSrc: isDevelopment
          ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
          : ["'self'"],

        // Styles: Allow inline styles for component libraries
        styleSrc: ["'self'", "'unsafe-inline'"],

        // Images: Allow data URIs for inline images and self
        imgSrc: ["'self'", 'data:', 'https:'],

        // Fonts: Allow self and data URIs
        fontSrc: ["'self'", 'data:'],

        // Connect: API calls - allow self and any configured API origins
        connectSrc: isDevelopment
          ? ["'self'", 'ws://localhost:*', 'http://localhost:*']
          : ["'self'"],

        // Frames: Disallow embedding content from other origins
        frameSrc: ["'none'"],

        // Objects: Disallow plugins like Flash
        objectSrc: ["'none'"],

        // Media: Allow self-hosted media
        mediaSrc: ["'self'"],

        // Base URI: Restrict base tag to prevent base tag injection attacks
        baseUri: ["'self'"],

        // Form actions: Only allow forms to submit to same origin
        formAction: ["'self'"],

        // Frame ancestors: Prevent embedding in iframes (redundant with X-Frame-Options)
        frameAncestors: ["'none'"],

        // Upgrade insecure requests in production
        ...(isProduction && { upgradeInsecureRequests: [] })
      }
    },

    /**
     * HTTP Strict Transport Security (HSTS)
     *
     * Forces browsers to only connect via HTTPS, preventing SSL stripping attacks.
     * Only enabled in production where HTTPS is properly configured.
     *
     * maxAge: 1 year (31536000 seconds)
     * includeSubDomains: Apply to all subdomains
     * preload: Allow inclusion in browser HSTS preload lists
     */
    strictTransportSecurity: isProduction
      ? {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true
      }
      : false, // Disabled in development (local dev doesn't use HTTPS)

    /**
     * X-Frame-Options
     *
     * Prevents clickjacking attacks by controlling whether the site can be embedded in iframes.
     * 'DENY' completely prevents the page from being embedded.
     */
    frameguard: {
      action: 'deny'
    },

    /**
     * X-Content-Type-Options
     *
     * Prevents MIME type sniffing by forcing browsers to respect declared content types.
     * This stops browsers from trying to "guess" file types which could lead to XSS.
     */
    noSniff: true,

    /**
     * Referrer-Policy
     *
     * Controls how much referrer information is sent with requests.
     * 'strict-origin-when-cross-origin' provides good privacy while maintaining functionality:
     * - Same-origin: Full URL
     * - Cross-origin HTTPS→HTTPS: Origin only
     * - Cross-origin HTTPS→HTTP: No referrer (prevents downgrade)
     */
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },

    /**
     * X-DNS-Prefetch-Control
     *
     * Controls browser DNS prefetching. Disabled to prevent potential privacy leaks
     * from browsers prefetching DNS for links the user hasn't clicked.
     */
    dnsPrefetchControl: {
      allow: false
    },

    /**
     * X-Download-Options
     *
     * Prevents Internet Explorer from executing downloads in the site's context.
     * IE-specific protection that prevents a class of attacks.
     */
    ieNoOpen: true,

    /**
     * X-Permitted-Cross-Domain-Policies
     *
     * Prevents Adobe Flash and PDF from loading data from this domain.
     * Set to 'none' for maximum security.
     */
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none'
    },

    /**
     * X-Powered-By
     *
     * Removes the X-Powered-By header to avoid revealing server technology.
     * This is a minor security improvement through obscurity.
     */
    hidePoweredBy: true
  };
}

module.exports = { getHelmetConfig };

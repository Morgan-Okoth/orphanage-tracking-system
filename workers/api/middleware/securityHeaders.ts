import { Context, Next } from 'hono';

/**
 * Security headers middleware
 * Adds Content Security Policy, HSTS, and other security headers
 * Requirements: 15.2
 */
export function securityHeadersMiddleware() {
  return async (c: Context, next: Next) => {
    await next();

    // Content Security Policy
    c.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );

    // HTTP Strict Transport Security - 1 year max-age with includeSubDomains
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');

    // Control referrer information
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy - restrict browser features
    c.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );
  };
}

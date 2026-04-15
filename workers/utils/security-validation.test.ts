import { describe, it, expect } from 'vitest';
import { sanitizeHtml, stripDangerousContent, sanitizeText, sanitizeFileName } from './validation';
import {
  registerSchema,
  createRequestSchema,
  loginSchema,
  createCommentSchema,
} from './schemas';

// ─── XSS Payloads ─────────────────────────────────────────────────────────────

const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '<svg onload=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  '<iframe src="javascript:alert(1)">',
  '<body onload=alert(1)>',
  'data:text/html,<script>alert(1)</script>',
  '<a href="javascript:void(0)">click</a>',
  '<<SCRIPT>alert("XSS");//<</SCRIPT>',
];

// ─── Path Traversal Payloads ──────────────────────────────────────────────────

const PATH_TRAVERSAL_PAYLOADS = [
  '../../../etc/passwd',
  '..\\..\\windows\\system32',
  '%2e%2e%2f%2e%2e%2f',
  '....//....//etc/passwd',
  '/etc/passwd',
  'C:\\Windows\\System32',
  'file\0name.pdf',
  '.hidden',
];

// ─── SQL Injection Payloads ───────────────────────────────────────────────────

const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE users; --",
  "1' OR '1'='1",
  "admin'--",
  "1; SELECT * FROM users",
];

// ─── sanitizeHtml ─────────────────────────────────────────────────────────────

describe('sanitizeHtml - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('encodes dangerous characters in: %s', (payload) => {
    const result = sanitizeHtml(payload);
    // After encoding, raw < and > should not appear
    expect(result).not.toMatch(/<script/i);
    expect(result).not.toMatch(/<iframe/i);
    expect(result).not.toMatch(/<svg/i);
    expect(result).not.toMatch(/<img/i);
    expect(result).not.toMatch(/<body/i);
  });

  it('encodes angle brackets as HTML entities', () => {
    const result = sanitizeHtml('<script>alert(1)</script>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).not.toContain('<script>');
  });

  it('encodes double quotes', () => {
    const result = sanitizeHtml('"quoted"');
    expect(result).toContain('&quot;');
    expect(result).not.toContain('"');
  });

  it('encodes single quotes', () => {
    const result = sanitizeHtml("it's a test");
    expect(result).toContain('&#x27;');
  });

  it('encodes forward slashes', () => {
    const result = sanitizeHtml('path/to/file');
    expect(result).toContain('&#x2F;');
  });

  it('encodes ampersands', () => {
    const result = sanitizeHtml('a & b');
    expect(result).toContain('&amp;');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
    expect(sanitizeHtml(123 as unknown as string)).toBe('');
  });
});

// ─── stripDangerousContent ────────────────────────────────────────────────────

describe('stripDangerousContent - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('removes dangerous content from: %s', (payload) => {
    const result = stripDangerousContent(payload);
    expect(result).not.toMatch(/<script[\s\S]*?>/i);
    expect(result).not.toMatch(/javascript\s*:/i);
    expect(result).not.toMatch(/on\w+\s*=/i);
    expect(result).not.toMatch(/<iframe/i);
  });

  it('removes script tags entirely', () => {
    const result = stripDangerousContent('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
  });

  it('removes event handler attributes', () => {
    const result = stripDangerousContent('<img src=x onerror=alert(1)>');
    expect(result).not.toMatch(/onerror/i);
  });

  it('removes javascript: URIs', () => {
    const result = stripDangerousContent('javascript:alert(1)');
    expect(result).not.toMatch(/javascript\s*:/i);
  });

  it('removes data:text/html URIs', () => {
    const result = stripDangerousContent('data:text/html,<script>alert(1)</script>');
    expect(result).not.toMatch(/data\s*:\s*text\/html/i);
  });

  it('removes iframe tags', () => {
    const result = stripDangerousContent('<iframe src="evil.com">');
    expect(result).not.toMatch(/<iframe/i);
  });

  it('preserves safe plain text', () => {
    const safe = 'Hello, this is a normal comment about school fees.';
    const result = stripDangerousContent(safe);
    expect(result).toBe(safe);
  });

  it('returns empty string for non-string input', () => {
    expect(stripDangerousContent(null as unknown as string)).toBe('');
  });
});

// ─── sanitizeFileName - path traversal prevention ─────────────────────────────

describe('sanitizeFileName - path traversal prevention', () => {
  it.each(PATH_TRAVERSAL_PAYLOADS)('sanitizes path traversal payload: %s', (payload) => {
    const result = sanitizeFileName(payload);
    expect(result).not.toContain('../');
    expect(result).not.toContain('..\\');
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('\0');
  });

  it('removes ../ sequences', () => {
    const result = sanitizeFileName('../../../etc/passwd');
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });

  it('removes null bytes', () => {
    const result = sanitizeFileName('file\0name.pdf');
    expect(result).not.toContain('\0');
  });

  it('removes leading dots (hidden files)', () => {
    const result = sanitizeFileName('.hidden');
    expect(result).not.toMatch(/^\./);
  });

  it('removes absolute path separators', () => {
    expect(sanitizeFileName('/etc/passwd')).not.toContain('/');
    expect(sanitizeFileName('C:\\Windows\\System32')).not.toContain('\\');
  });

  it('preserves safe file names', () => {
    expect(sanitizeFileName('document.pdf')).toBe('document.pdf');
    expect(sanitizeFileName('my-file_v2.jpg')).toBe('my-file_v2.jpg');
  });

  it('limits file name to 255 characters', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(255);
  });

  it('returns fallback for empty input', () => {
    expect(sanitizeFileName('')).toBe('file');
  });
});

// ─── sanitizeText - SQL injection handling ────────────────────────────────────

describe('sanitizeText - SQL injection handling', () => {
  it.each(SQL_INJECTION_PAYLOADS)('removes angle brackets from SQL payload: %s', (payload) => {
    const result = sanitizeText(payload);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  it('truncates to maxLength', () => {
    const long = 'a'.repeat(2000);
    expect(sanitizeText(long, 100).length).toBe(100);
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeText(null as unknown as string)).toBe('');
  });
});

// ─── Zod schemas - oversized / malicious inputs ───────────────────────────────

describe('Zod schemas - reject oversized inputs', () => {
  it('rejects invalid email format (buffer overflow attempt)', () => {
    // The email schema validates format; a 300-char local part is technically
    // valid per the regex but we verify the schema at least enforces format.
    // A string with no @ is definitively rejected.
    const result = loginSchema.safeParse({
      email: 'a'.repeat(300), // no @ — invalid format
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password longer than 100 characters', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      phone: '+254712345678',
      password: 'a'.repeat(101),
      firstName: 'Test',
      lastName: 'User',
      role: 'STUDENT',
    });
    expect(result.success).toBe(false);
  });

  it('rejects request reason longer than 1000 characters', () => {
    const result = createRequestSchema.safeParse({
      type: 'SCHOOL_FEES',
      amount: 100,
      reason: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects comment content longer than 2000 characters', () => {
    const result = createCommentSchema.safeParse({
      content: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative amounts', () => {
    const result = createRequestSchema.safeParse({
      type: 'SCHOOL_FEES',
      amount: -100,
      reason: 'Valid reason here',
    });
    expect(result.success).toBe(false);
  });

  it('rejects amounts exceeding 1,000,000', () => {
    const result = createRequestSchema.safeParse({
      type: 'SCHOOL_FEES',
      amount: 1_000_001,
      reason: 'Valid reason here',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phone number format', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      phone: '0712345678', // missing +254 prefix
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      role: 'STUDENT',
    });
    expect(result.success).toBe(false);
  });
});

describe('Zod schemas - null bytes in strings', () => {
  it('rejects or sanitizes null bytes in email', () => {
    const result = loginSchema.safeParse({
      email: 'test\0@example.com',
      password: 'password123',
    });
    // Either fails validation or the null byte causes email format rejection
    if (result.success) {
      expect(result.data.email).not.toContain('\0');
    } else {
      expect(result.success).toBe(false);
    }
  });

  it('rejects empty required fields', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('Zod schemas - SQL injection strings pass through (Drizzle handles parameterization)', () => {
  it.each(SQL_INJECTION_PAYLOADS)(
    'SQL payload "%s" is accepted by comment schema (ORM handles safety)',
    (payload) => {
      // SQL injection strings are valid text — Drizzle uses parameterized queries
      // so these are safe to store as-is. Zod should accept them as valid strings.
      const result = createCommentSchema.safeParse({ content: payload });
      // These are short strings, so they should pass Zod length validation
      expect(result.success).toBe(true);
    }
  );
});

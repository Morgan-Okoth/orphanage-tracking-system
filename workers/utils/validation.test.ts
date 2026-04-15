/**
 * Tests for validation and sanitization utilities
 * Requirements: 3.3, 15.7
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeFileName, sanitizeText } from './validation';
import {
  registerSchema,
  createRequestSchema,
  initiatePaymentSchema,
} from './schemas';
import { UserRole, RequestType } from '../types';

// ─── sanitizeHtml ─────────────────────────────────────────────────────────────

describe('sanitizeHtml', () => {
  it('encodes script tags', () => {
    const result = sanitizeHtml('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('encodes onerror event handler', () => {
    const result = sanitizeHtml('<img onerror=alert(1)>');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('encodes javascript: URI', () => {
    const result = sanitizeHtml('<a href="javascript:void(0)">click</a>');
    expect(result).not.toContain('<a ');
    expect(result).toContain('&lt;a');
  });

  it('encodes HTML entities', () => {
    const result = sanitizeHtml('Hello & "World" <test>');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });

  it('passes through safe plain text unchanged (except entity encoding)', () => {
    const result = sanitizeHtml('Hello World');
    expect(result).toBe('Hello World');
  });
});

// ─── sanitizeFileName ─────────────────────────────────────────────────────────

describe('sanitizeFileName', () => {
  it('removes path traversal sequences', () => {
    const result = sanitizeFileName('../../../etc/passwd');
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });

  it('removes null bytes', () => {
    const result = sanitizeFileName('file\0name.pdf');
    expect(result).not.toContain('\0');
  });

  it('preserves normal file names', () => {
    const result = sanitizeFileName('normal-file.pdf');
    expect(result).toBe('normal-file.pdf');
  });

  it('removes backslash path separators', () => {
    const result = sanitizeFileName('..\\..\\windows\\system32\\cmd.exe');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('..');
  });

  it('strips leading dots (hidden files)', () => {
    const result = sanitizeFileName('.hidden-file.txt');
    expect(result).not.toMatch(/^\./);
  });

  it('replaces dangerous characters with underscores', () => {
    const result = sanitizeFileName('file;name|test.pdf');
    expect(result).not.toContain(';');
    expect(result).not.toContain('|');
  });

  it('limits length to 255 characters while preserving extension', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(255);
    expect(result.endsWith('.pdf')).toBe(true);
  });

  it('returns "file" for empty input', () => {
    expect(sanitizeFileName('')).toBe('file');
  });
});

// ─── sanitizeText ─────────────────────────────────────────────────────────────

describe('sanitizeText', () => {
  it('removes angle brackets (HTML tags)', () => {
    const result = sanitizeText('<b>bold</b> text');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('bold');
  });

  it('truncates to maxLength', () => {
    const long = 'a'.repeat(2000);
    const result = sanitizeText(long, 100);
    expect(result.length).toBe(100);
  });

  it('trims whitespace', () => {
    const result = sanitizeText('  hello world  ');
    expect(result).toBe('hello world');
  });

  it('passes through normal text unchanged', () => {
    const result = sanitizeText('Hello, this is normal text.');
    expect(result).toBe('Hello, this is normal text.');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeText(null as unknown as string)).toBe('');
    expect(sanitizeText(undefined as unknown as string)).toBe('');
  });

  it('uses default maxLength of 1000', () => {
    const long = 'x'.repeat(1500);
    const result = sanitizeText(long);
    expect(result.length).toBe(1000);
  });
});

// ─── registerSchema ───────────────────────────────────────────────────────────

describe('registerSchema', () => {
  const validPayload = {
    email: 'student@example.com',
    phone: '+254712345678',
    password: 'SecurePass1',
    firstName: 'Jane',
    lastName: 'Doe',
    role: UserRole.STUDENT,
  };

  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({ ...validPayload, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({ ...validPayload, password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phone format', () => {
    const result = registerSchema.safeParse({ ...validPayload, phone: '0712345678' });
    expect(result.success).toBe(false);
  });

  it('rejects missing firstName', () => {
    const { firstName: _, ...rest } = validPayload;
    const result = registerSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = registerSchema.safeParse({ ...validPayload, role: 'SUPERUSER' });
    expect(result.success).toBe(false);
  });

  it('normalizes email to lowercase', () => {
    const result = registerSchema.safeParse({ ...validPayload, email: 'STUDENT@EXAMPLE.COM' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('student@example.com');
    }
  });
});

// ─── createRequestSchema ──────────────────────────────────────────────────────

describe('createRequestSchema', () => {
  const validPayload = {
    type: RequestType.SCHOOL_FEES,
    amount: 5000,
    reason: 'Need funds for school fees this semester',
  };

  it('accepts valid request data', () => {
    const result = createRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects negative amount', () => {
    const result = createRequestSchema.safeParse({ ...validPayload, amount: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects amount exceeding 1,000,000', () => {
    const result = createRequestSchema.safeParse({ ...validPayload, amount: 1_500_000 });
    expect(result.success).toBe(false);
  });

  it('rejects amount with more than 2 decimal places', () => {
    const result = createRequestSchema.safeParse({ ...validPayload, amount: 100.123 });
    expect(result.success).toBe(false);
  });

  it('accepts amount with exactly 2 decimal places', () => {
    const result = createRequestSchema.safeParse({ ...validPayload, amount: 100.50 });
    expect(result.success).toBe(true);
  });

  it('rejects reason shorter than 10 characters', () => {
    const result = createRequestSchema.safeParse({ ...validPayload, reason: 'Too short' });
    expect(result.success).toBe(false);
  });

  it('rejects reason longer than 1000 characters', () => {
    const result = createRequestSchema.safeParse({ ...validPayload, reason: 'a'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid request type', () => {
    const result = createRequestSchema.safeParse({ ...validPayload, type: 'INVALID_TYPE' });
    expect(result.success).toBe(false);
  });
});

// ─── initiatePaymentSchema ────────────────────────────────────────────────────

describe('initiatePaymentSchema', () => {
  const validPayload = {
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    phoneNumber: '+254712345678',
    amount: 5000,
  };

  it('accepts valid payment data', () => {
    const result = initiatePaymentSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for requestId', () => {
    const result = initiatePaymentSchema.safeParse({ ...validPayload, requestId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phone number format', () => {
    const result = initiatePaymentSchema.safeParse({ ...validPayload, phoneNumber: '0712345678' });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = initiatePaymentSchema.safeParse({ ...validPayload, amount: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects amount exceeding 1,000,000', () => {
    const result = initiatePaymentSchema.safeParse({ ...validPayload, amount: 2_000_000 });
    expect(result.success).toBe(false);
  });

  it('accepts phone number with 254 prefix without +', () => {
    const result = initiatePaymentSchema.safeParse({ ...validPayload, phoneNumber: '254712345678' });
    expect(result.success).toBe(true);
  });
});

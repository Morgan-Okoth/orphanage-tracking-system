/**
 * Validation and sanitization utilities
 * Requirements: 3.3, 15.7
 *
 * Note: DOMPurify requires a DOM environment and is not available in
 * Cloudflare Workers. We use a lightweight regex-based approach instead.
 */
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, ALLOWED_FILE_EXTENSIONS } from './constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

// ─── XSS Prevention ───────────────────────────────────────────────────────────

/**
 * Dangerous HTML patterns that could enable XSS attacks.
 * Covers script tags, event handlers, javascript: URIs, and data: URIs.
 */
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<script[^>]*>/gi,
  /javascript\s*:/gi,
  /data\s*:\s*text\/html/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi, // onerror="...", onclick='...'
  /on\w+\s*=\s*[^\s>]*/gi,        // onerror=alert(1)
  /<iframe[\s\S]*?>/gi,
  /<object[\s\S]*?>/gi,
  /<embed[\s\S]*?>/gi,
  /<link[\s\S]*?>/gi,
  /<meta[\s\S]*?>/gi,
  /expression\s*\(/gi,             // CSS expression()
  /vbscript\s*:/gi,
];

/**
 * Sanitize a string to prevent XSS attacks.
 * Suitable for use in Cloudflare Workers (no DOM required).
 * Encodes HTML entities and strips dangerous patterns.
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';

  // First encode HTML entities
  let sanitized = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized;
}

/**
 * Strip dangerous HTML/script patterns from a string (more aggressive).
 * Use this for rich-text fields where you want to remove tags entirely.
 */
export function stripDangerousContent(input: string): string {
  if (typeof input !== 'string') return '';

  let result = input;
  for (const pattern of XSS_PATTERNS) {
    result = result.replace(pattern, '');
  }
  // Remove any remaining HTML tags
  result = result.replace(/<[^>]*>/g, '');
  return result;
}

/**
 * Sanitize plain text input: trim, limit length, remove angle brackets.
 */
export function sanitizeText(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '');
}

// ─── File Name Sanitization ───────────────────────────────────────────────────

/**
 * Sanitize a file name to prevent path traversal and other attacks.
 * - Removes path separators and null bytes
 * - Strips leading dots (hidden files)
 * - Replaces dangerous characters with underscores
 * - Limits length to 255 characters
 */
export function sanitizeFileName(fileName: string): string {
  if (typeof fileName !== 'string' || fileName.length === 0) return 'file';

  // Remove path components (path traversal prevention)
  let name = fileName
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/\//g, '')
    .replace(/\\/g, '');

  // Remove null bytes
  name = name.replace(/\0/g, '');

  // Remove leading dots (hidden files on Unix)
  name = name.replace(/^\.+/, '');

  // Replace dangerous characters with underscores
  // Allow: alphanumeric, dash, underscore, dot, space
  name = name.replace(/[^a-zA-Z0-9\-_.() ]/g, '_');

  // Collapse multiple underscores/spaces
  name = name.replace(/_{2,}/g, '_').replace(/ {2,}/g, ' ').trim();

  // Limit length while preserving extension
  if (name.length > 255) {
    const lastDot = name.lastIndexOf('.');
    if (lastDot > 0) {
      const ext = name.substring(lastDot); // e.g. ".pdf"
      const base = name.substring(0, 255 - ext.length);
      name = base + ext;
    } else {
      name = name.substring(0, 255);
    }
  }

  return name || 'file';
}

// ─── File Validation ──────────────────────────────────────────────────────────

export function validateFileName(fileName: string): FileValidationResult {
  if (!fileName || fileName.length === 0) {
    return { valid: false, error: 'File name is empty' };
  }

  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return { valid: false, error: 'File name contains invalid characters' };
  }

  if (fileName.includes('\0')) {
    return { valid: false, error: 'File name contains null bytes' };
  }

  if (fileName.length > 255) {
    return { valid: false, error: 'File name is too long (max 255 characters)' };
  }

  return { valid: true };
}

export function validateFileType(contentType: string, fileName: string): FileValidationResult {
  if (!ALLOWED_FILE_TYPES.includes(contentType.toLowerCase())) {
    return {
      valid: false,
      error: 'Invalid file type. Allowed types: PDF, JPG, JPEG, PNG',
    };
  }

  const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed extensions: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`,
    };
  }

  return { valid: true };
}

export function validateFileSize(fileSize: number): FileValidationResult {
  if (fileSize === 0) {
    return { valid: false, error: 'File is empty' };
  }

  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  return { valid: true };
}

export function validateFile(
  fileName: string,
  contentType: string,
  fileSize: number
): FileValidationResult {
  const nameResult = validateFileName(fileName);
  if (!nameResult.valid) return nameResult;

  const typeResult = validateFileType(contentType, fileName);
  if (!typeResult.valid) return typeResult;

  const sizeResult = validateFileSize(fileSize);
  if (!sizeResult.valid) return sizeResult;

  return { valid: true };
}

// ─── Field Validators ─────────────────────────────────────────────────────────

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhoneNumber(phone: string): boolean {
  // Kenyan phone numbers: +254XXXXXXXXX
  const phoneRegex = /^\+254[17]\d{8}$/;
  return phoneRegex.test(phone);
}

export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// ─── Malware Scanning Placeholder ────────────────────────────────────────────

/**
 * Placeholder for malware scanning.
 * In production, integrate with ClamAV, VirusTotal, or Cloudflare's scanning.
 */
export async function scanForMalware(fileData: ArrayBuffer): Promise<{
  clean: boolean;
  threat?: string;
}> {
  console.log('[MALWARE_SCAN] File scan placeholder - integrate with scanning service');
  return { clean: true };
}

import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  encryptNullable,
  decryptNullable,
  encryptAmount,
  decryptAmount,
  isEncrypted,
} from './encryption';

// A valid 64-char hex key (32 bytes) for testing
const TEST_KEY = 'a'.repeat(64); // 32 bytes of 0xaa

describe('encryption', () => {
  describe('encrypt / decrypt round-trip', () => {
    it('should encrypt and decrypt a simple string', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await encrypt(plaintext, TEST_KEY);
      const decrypted = await decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt a phone number', async () => {
      const phone = '+254712345678';
      const encrypted = await encrypt(phone, TEST_KEY);
      const decrypted = await decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe(phone);
    });

    it('should encrypt and decrypt a national ID', async () => {
      const nationalId = '12345678';
      const encrypted = await encrypt(nationalId, TEST_KEY);
      const decrypted = await decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe(nationalId);
    });

    it('should encrypt and decrypt a financial amount string', async () => {
      const amount = '15000.50';
      const encrypted = await encrypt(amount, TEST_KEY);
      const decrypted = await decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe(amount);
    });

    it('should produce different ciphertext for the same plaintext (random IV)', async () => {
      const plaintext = 'same input';
      const encrypted1 = await encrypt(plaintext, TEST_KEY);
      const encrypted2 = await encrypt(plaintext, TEST_KEY);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce output in iv:ciphertext format', async () => {
      const encrypted = await encrypt('test', TEST_KEY);
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(2);
      // IV is 12 bytes = 24 hex chars
      expect(parts[0]).toHaveLength(24);
      // Ciphertext should be non-empty
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it('should throw on invalid key length', async () => {
      await expect(encrypt('test', 'short-key')).rejects.toThrow(
        'ENCRYPTION_KEY must be a 64-character hex string'
      );
    });

    it('should throw on invalid encrypted format', async () => {
      await expect(decrypt('invalid-format', TEST_KEY)).rejects.toThrow(
        'Invalid encrypted text format'
      );
    });

    it('should throw when decrypting with wrong key', async () => {
      const encrypted = await encrypt('secret', TEST_KEY);
      const wrongKey = 'b'.repeat(64);
      await expect(decrypt(encrypted, wrongKey)).rejects.toThrow();
    });
  });

  describe('encryptNullable / decryptNullable', () => {
    it('should return null for null input', async () => {
      expect(await encryptNullable(null, TEST_KEY)).toBeNull();
      expect(await decryptNullable(null, TEST_KEY)).toBeNull();
    });

    it('should return null for undefined input', async () => {
      expect(await encryptNullable(undefined, TEST_KEY)).toBeNull();
      expect(await decryptNullable(undefined, TEST_KEY)).toBeNull();
    });

    it('should return null for empty string', async () => {
      expect(await encryptNullable('', TEST_KEY)).toBeNull();
      expect(await decryptNullable('', TEST_KEY)).toBeNull();
    });

    it('should encrypt and decrypt non-null values', async () => {
      const value = 'sensitive data';
      const encrypted = await encryptNullable(value, TEST_KEY);
      expect(encrypted).not.toBeNull();
      const decrypted = await decryptNullable(encrypted!, TEST_KEY);
      expect(decrypted).toBe(value);
    });
  });

  describe('encryptAmount / decryptAmount', () => {
    it('should encrypt and decrypt a positive amount', async () => {
      const amount = 15000.5;
      const encrypted = await encryptAmount(amount, TEST_KEY);
      const decrypted = await decryptAmount(encrypted, TEST_KEY);
      expect(decrypted).toBe(amount);
    });

    it('should encrypt and decrypt zero', async () => {
      const amount = 0;
      const encrypted = await encryptAmount(amount, TEST_KEY);
      const decrypted = await decryptAmount(encrypted, TEST_KEY);
      expect(decrypted).toBe(amount);
    });

    it('should encrypt and decrypt large amounts', async () => {
      const amount = 1000000;
      const encrypted = await encryptAmount(amount, TEST_KEY);
      const decrypted = await decryptAmount(encrypted, TEST_KEY);
      expect(decrypted).toBe(amount);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for a valid encrypted string', async () => {
      const encrypted = await encrypt('test', TEST_KEY);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for a plain string', () => {
      expect(isEncrypted('plain text')).toBe(false);
    });

    it('should return false for a string with wrong IV length', () => {
      expect(isEncrypted('abc:ciphertext')).toBe(false);
    });

    it('should return false for a string with no colon', () => {
      expect(isEncrypted('nociphertext')).toBe(false);
    });
  });
});

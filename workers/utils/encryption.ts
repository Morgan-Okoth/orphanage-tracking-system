/**
 * AES-256-GCM Encryption Service for Cloudflare Workers
 *
 * Uses the Web Crypto API (available natively in Cloudflare Workers).
 * Encryption keys are stored as Cloudflare Worker secrets (ENCRYPTION_KEY env var).
 *
 * Requirements: 15.1, 15.3, 15.5
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // AES-256
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 128; // 128-bit auth tag

/**
 * Import a raw 32-byte hex key string as a CryptoKey for AES-256-GCM.
 * The ENCRYPTION_KEY secret must be a 64-character hex string (32 bytes).
 */
async function importKey(hexKey: string): Promise<CryptoKey> {
  if (hexKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes for AES-256)');
  }

  const keyBytes = hexToBytes(hexKey);

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns a string in the format: `<iv_hex>:<ciphertext_hex>`
 * The auth tag is appended to the ciphertext by the Web Crypto API automatically.
 *
 * @param plaintext - The string to encrypt
 * @param encryptionKey - 64-char hex string (ENCRYPTION_KEY secret)
 */
export async function encrypt(plaintext: string, encryptionKey: string): Promise<string> {
  const key = await importKey(encryptionKey);

  // Generate a random 96-bit IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    plaintextBytes
  );

  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  return `${bytesToHex(iv)}:${bytesToHex(ciphertextBytes)}`;
}

/**
 * Decrypt a ciphertext string produced by `encrypt`.
 *
 * @param encryptedText - String in format `<iv_hex>:<ciphertext_hex>`
 * @param encryptionKey - 64-char hex string (ENCRYPTION_KEY secret)
 */
export async function decrypt(encryptedText: string, encryptionKey: string): Promise<string> {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format. Expected <iv_hex>:<ciphertext_hex>');
  }

  const [ivHex, ciphertextHex] = parts;
  const iv = hexToBytes(ivHex);
  const ciphertextBytes = hexToBytes(ciphertextHex);

  const key = await importKey(encryptionKey);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertextBytes
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBuffer);
}

/**
 * Encrypt a value only if it is non-null/non-empty.
 * Returns null if the input is null or undefined.
 */
export async function encryptNullable(
  value: string | null | undefined,
  encryptionKey: string
): Promise<string | null> {
  if (value == null || value === '') return null;
  return encrypt(value, encryptionKey);
}

/**
 * Decrypt a value only if it is non-null/non-empty.
 * Returns null if the input is null or undefined.
 */
export async function decryptNullable(
  value: string | null | undefined,
  encryptionKey: string
): Promise<string | null> {
  if (value == null || value === '') return null;
  return decrypt(value, encryptionKey);
}

/**
 * Encrypt a numeric amount as a string, then return the encrypted string.
 * Useful for encrypting financial amounts stored in the database.
 */
export async function encryptAmount(amount: number, encryptionKey: string): Promise<string> {
  return encrypt(amount.toString(), encryptionKey);
}

/**
 * Decrypt an encrypted amount back to a number.
 */
export async function decryptAmount(encryptedAmount: string, encryptionKey: string): Promise<number> {
  const decrypted = await decrypt(encryptedAmount, encryptionKey);
  const num = parseFloat(decrypted);
  if (isNaN(num)) {
    throw new Error('Decrypted amount is not a valid number');
  }
  return num;
}

/**
 * Sensitive fields that should be encrypted at rest.
 * Used to document which fields are encrypted in the database.
 *
 * Requirements: 15.1 (financial data), 15.3 (documents), 15.5 (keys separate from data)
 */
export const ENCRYPTED_FIELDS = {
  users: ['phone'] as const,
  transactions: ['phoneNumber', 'mpesaTransactionId', 'mpesaReceiptNumber', 'amount'] as const,
} as const;

/**
 * Helper to check if a string looks like an encrypted value (iv:ciphertext format).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 2) return false;
  // IV should be 24 hex chars (12 bytes), ciphertext should be non-empty
  return parts[0].length === 24 && parts[1].length > 0;
}

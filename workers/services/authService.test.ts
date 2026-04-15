import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './authService';
import { UserRole, AccountStatus } from '../types';

// Mock KV namespace
function createMockKV() {
  const store = new Map<string, string>();
  return {
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  } as unknown as KVNamespace;
}

const TEST_JWT_SECRET = 'test-secret-key-for-unit-tests-minimum-32-chars';

describe('AuthService', () => {
  let authService: AuthService;
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    authService = new AuthService(TEST_JWT_SECRET, mockKV as unknown as KVNamespace);
  });

  // ─── Password Hashing ────────────────────────────────────────────────────────

  describe('hashPassword', () => {
    it('should hash a password and return a bcrypt hash', async () => {
      const password = 'SecurePass123!';
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      // bcrypt hashes start with $2b$ or $2a$
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it('should produce different hashes for the same password (salt)', async () => {
      const password = 'SecurePass123!';
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for a correct password', async () => {
      const password = 'SecurePass123!';
      const hash = await authService.hashPassword(password);

      const result = await authService.verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for an incorrect password', async () => {
      const password = 'SecurePass123!';
      const hash = await authService.hashPassword(password);

      const result = await authService.verifyPassword('WrongPassword!', hash);
      expect(result).toBe(false);
    });

    it('should return false for an empty password against a valid hash', async () => {
      const hash = await authService.hashPassword('SecurePass123!');
      const result = await authService.verifyPassword('', hash);
      expect(result).toBe(false);
    });
  });

  // ─── JWT Token Generation & Validation ───────────────────────────────────────

  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', () => {
      const token = authService.generateAccessToken('user-123', 'test@example.com', UserRole.STUDENT);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // JWT format: header.payload.signature
      expect(token.split('.')).toHaveLength(3);
    });

    it('should embed userId, email, and role in the token payload', () => {
      const userId = 'user-abc';
      const email = 'admin@example.com';
      const role = UserRole.ADMIN_LEVEL_1;

      const token = authService.generateAccessToken(userId, email, role);
      const decoded = authService.verifyAccessToken(token);

      expect(decoded.userId).toBe(userId);
      expect(decoded.email).toBe(email);
      expect(decoded.role).toBe(role);
    });

    it('should generate tokens for all user roles', () => {
      const roles = [UserRole.STUDENT, UserRole.ADMIN_LEVEL_1, UserRole.ADMIN_LEVEL_2];

      for (const role of roles) {
        const token = authService.generateAccessToken('user-id', 'user@example.com', role);
        const decoded = authService.verifyAccessToken(token);
        expect(decoded.role).toBe(role);
      }
    });
  });

  describe('verifyAccessToken', () => {
    it('should successfully verify a valid token', () => {
      const token = authService.generateAccessToken('user-123', 'test@example.com', UserRole.STUDENT);
      const decoded = authService.verifyAccessToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
    });

    it('should throw INVALID_TOKEN for a tampered token', () => {
      const token = authService.generateAccessToken('user-123', 'test@example.com', UserRole.STUDENT);
      const tampered = token.slice(0, -5) + 'XXXXX';

      expect(() => authService.verifyAccessToken(tampered)).toThrow('INVALID_TOKEN');
    });

    it('should throw INVALID_TOKEN for a token signed with a different secret', () => {
      const otherService = new AuthService('different-secret-key-minimum-32-chars!!', mockKV as unknown as KVNamespace);
      const token = otherService.generateAccessToken('user-123', 'test@example.com', UserRole.STUDENT);

      expect(() => authService.verifyAccessToken(token)).toThrow('INVALID_TOKEN');
    });

    it('should throw TOKEN_EXPIRED for an expired token', async () => {
      // Create a service and manually sign a token with past expiry
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.default.sign(
        { userId: 'user-123', email: 'test@example.com', role: UserRole.STUDENT },
        TEST_JWT_SECRET,
        { expiresIn: -1, algorithm: 'HS256' }
      );

      expect(() => authService.verifyAccessToken(expiredToken)).toThrow('TOKEN_EXPIRED');
    });

    it('should throw INVALID_TOKEN for a completely invalid string', () => {
      expect(() => authService.verifyAccessToken('not.a.jwt')).toThrow('INVALID_TOKEN');
    });
  });

  // ─── Refresh Token ────────────────────────────────────────────────────────────

  describe('generateRefreshToken', () => {
    it('should generate a UUID-format refresh token', async () => {
      const token = await authService.generateRefreshToken('user-123');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // UUID v4 format
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should store the refresh token in KV with the user ID', async () => {
      const userId = 'user-456';
      const token = await authService.generateRefreshToken(userId);

      expect(mockKV.put).toHaveBeenCalledWith(
        `refresh_token:${token}`,
        userId,
        expect.objectContaining({ expirationTtl: 7 * 24 * 60 * 60 })
      );
    });

    it('should generate unique tokens on each call', async () => {
      const token1 = await authService.generateRefreshToken('user-123');
      const token2 = await authService.generateRefreshToken('user-123');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should return the userId for a valid refresh token', async () => {
      const userId = 'user-789';
      const token = await authService.generateRefreshToken(userId);

      const result = await authService.verifyRefreshToken(token);
      expect(result).toBe(userId);
    });

    it('should return null for an unknown refresh token', async () => {
      const result = await authService.verifyRefreshToken('non-existent-token');
      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('should remove the refresh token from KV', async () => {
      const userId = 'user-123';
      const token = await authService.generateRefreshToken(userId);

      await authService.revokeRefreshToken(token);

      const result = await authService.verifyRefreshToken(token);
      expect(result).toBeNull();
    });
  });

  // ─── Token Rotation ───────────────────────────────────────────────────────────

  describe('generateTokens', () => {
    it('should return accessToken, refreshToken, and expiresIn', async () => {
      const tokens = await authService.generateTokens('user-123', 'test@example.com', UserRole.STUDENT);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe(3600);
    });

    it('should generate a verifiable access token', async () => {
      const tokens = await authService.generateTokens('user-123', 'test@example.com', UserRole.ADMIN_LEVEL_2);
      const decoded = authService.verifyAccessToken(tokens.accessToken);

      expect(decoded.userId).toBe('user-123');
      expect(decoded.role).toBe(UserRole.ADMIN_LEVEL_2);
    });
  });

  describe('logout', () => {
    it('should revoke the refresh token on logout', async () => {
      const token = await authService.generateRefreshToken('user-123');

      await authService.logout(token);

      const result = await authService.verifyRefreshToken(token);
      expect(result).toBeNull();
    });
  });
});

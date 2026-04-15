import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { UserRole, AccountStatus, JWTPayload } from '../types';
import { getDb } from '../db/client';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '1h'; // 1 hour
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterData {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface LoginData {
  email: string;
  password: string;
}

export class AuthService {
  private jwtSecret: string;
  private kv: KVNamespace;

  constructor(jwtSecret: string, sessionsKV: KVNamespace) {
    this.jwtSecret = jwtSecret;
    this.kv = sessionsKV;
  }

  /**
   * Hash password using bcrypt with 12 rounds
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access token with 1-hour expiration
   */
  generateAccessToken(userId: string, email: string, role: UserRole): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId,
      email,
      role,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      algorithm: 'HS256',
    });
  }

  /**
   * Generate refresh token (random UUID) with 7-day expiration
   */
  async generateRefreshToken(userId: string): Promise<string> {
    const refreshToken = crypto.randomUUID();
    
    // Store refresh token in KV with expiration
    await this.kv.put(
      `refresh_token:${refreshToken}`,
      userId,
      { expirationTtl: REFRESH_TOKEN_EXPIRY_SECONDS }
    );

    return refreshToken;
  }

  /**
   * Generate both access and refresh tokens
   */
  async generateTokens(userId: string, email: string, role: UserRole): Promise<AuthTokens> {
    const accessToken = this.generateAccessToken(userId, email, role);
    const refreshToken = await this.generateRefreshToken(userId);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour in seconds
    };
  }

  /**
   * Verify JWT access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('TOKEN_EXPIRED');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('INVALID_TOKEN');
      }
      throw new Error('TOKEN_VERIFICATION_FAILED');
    }
  }

  /**
   * Verify refresh token and get associated user ID
   */
  async verifyRefreshToken(refreshToken: string): Promise<string | null> {
    const userId = await this.kv.get(`refresh_token:${refreshToken}`);
    return userId;
  }

  /**
   * Revoke refresh token (for logout)
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.kv.delete(`refresh_token:${refreshToken}`);
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    // Note: KV doesn't support querying by value, so we'll need to track tokens differently
    // For now, we'll implement single token revocation
    // In production, consider using a different approach like storing tokens in D1
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData, db: D1Database): Promise<{ userId: string; accountStatus: AccountStatus }> {
    const dbClient = getDb(db);

    // Check if user already exists
    const existingUser = await dbClient
      .select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .get();

    if (existingUser) {
      throw new Error('USER_ALREADY_EXISTS');
    }

    // Check if phone already exists
    const existingPhone = await dbClient
      .select()
      .from(users)
      .where(eq(users.phone, data.phone))
      .get();

    if (existingPhone) {
      throw new Error('PHONE_ALREADY_EXISTS');
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Create user with PENDING status
    const userId = crypto.randomUUID();
    await dbClient.insert(users).values({
      id: userId,
      email: data.email.toLowerCase(),
      phone: data.phone,
      passwordHash,
      role: data.role,
      firstName: data.firstName,
      lastName: data.lastName,
      accountStatus: AccountStatus.PENDING,
      isEmailVerified: false,
      isPhoneVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      userId,
      accountStatus: AccountStatus.PENDING,
    };
  }

  /**
   * Login user and generate tokens
   */
  async login(data: LoginData, db: D1Database): Promise<{ user: any; tokens: AuthTokens }> {
    const dbClient = getDb(db);

    // Find user by email
    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .get();

    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(data.password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Check if account is active
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new Error(`ACCOUNT_${user.accountStatus}`);
    }

    // Update last login timestamp
    await dbClient
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role as UserRole);

    // Return user data (without password hash)
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      tokens,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string, db: D1Database): Promise<AuthTokens> {
    // Verify refresh token
    const userId = await this.verifyRefreshToken(refreshToken);
    if (!userId) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    const dbClient = getDb(db);

    // Get user data
    const user = await dbClient
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Check if account is still active
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new Error(`ACCOUNT_${user.accountStatus}`);
    }

    // Revoke old refresh token
    await this.revokeRefreshToken(refreshToken);

    // Generate new tokens (token rotation)
    const newTokens = await this.generateTokens(user.id, user.email, user.role as UserRole);

    return newTokens;
  }

  /**
   * Logout user by revoking refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    await this.revokeRefreshToken(refreshToken);
  }
}

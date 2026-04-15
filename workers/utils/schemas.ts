/**
 * Centralized Zod validation schemas for all API endpoints
 * Requirements: 3.3, 15.7
 */
import { z } from 'zod';
import { UserRole, RequestType } from '../types';

// ─── Reusable field validators ────────────────────────────────────────────────

const emailField = z.string().email('Invalid email address').toLowerCase().trim();

const phoneField = z
  .string()
  .regex(/^\+254\d{9}$/, 'Phone must be in format +254XXXXXXXXX');

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must not exceed 100 characters');

const nameField = (label: string) =>
  z.string().min(1, `${label} is required`).max(100, `${label} must not exceed 100 characters`).trim();

const uuidField = z.string().uuid('Invalid ID format');

const reasonField = (min = 10, max = 500) =>
  z.string().min(min, `Reason must be at least ${min} characters`).max(max, `Reason must not exceed ${max} characters`).trim();

// ─── Auth schemas ─────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: emailField,
  phone: phoneField,
  password: passwordField,
  firstName: nameField('First name'),
  lastName: nameField('Last name'),
  role: z.nativeEnum(UserRole),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: uuidField,
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordField,
});

// ─── Request schemas ──────────────────────────────────────────────────────────

export const createRequestSchema = z.object({
  type: z.nativeEnum(RequestType),
  amount: z
    .number({ invalid_type_error: 'Amount must be a number' })
    .positive('Amount must be positive')
    .max(1_000_000, 'Amount must not exceed 1,000,000')
    .refine(
      (val) => Math.round(val * 100) / 100 === val,
      'Amount must have at most 2 decimal places'
    ),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(1000, 'Reason must not exceed 1000 characters')
    .trim(),
});

export const updateRequestSchema = z.object({
  type: z.nativeEnum(RequestType).optional(),
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(1_000_000, 'Amount must not exceed 1,000,000')
    .refine(
      (val) => Math.round(val * 100) / 100 === val,
      'Amount must have at most 2 decimal places'
    )
    .optional(),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(1000, 'Reason must not exceed 1000 characters')
    .trim()
    .optional(),
});

export const rejectRequestSchema = z.object({
  reason: reasonField(10, 500),
});

export const flagRequestSchema = z.object({
  reason: reasonField(10, 500),
});

export const requestDocsSchema = z.object({
  reason: reasonField(10, 500),
});

export const approveRequestSchema = z.object({
  comment: z.string().max(500, 'Comment must not exceed 500 characters').trim().optional(),
});

// ─── Comment schemas ──────────────────────────────────────────────────────────

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment content is required')
    .max(2000, 'Comment must not exceed 2000 characters')
    .trim(),
  isInternal: z.boolean().optional().default(false),
});

// ─── User schemas ─────────────────────────────────────────────────────────────

export const updateUserSchema = z.object({
  firstName: nameField('First name').optional(),
  lastName: nameField('Last name').optional(),
  phone: phoneField.optional(),
  email: emailField.optional(),
});

export const rejectUserSchema = z.object({
  reason: reasonField(10, 500),
});

export const createUserSchema = z.object({
  email: emailField,
  phone: phoneField,
  password: passwordField,
  firstName: nameField('First name'),
  lastName: nameField('Last name'),
  role: z.nativeEnum(UserRole),
});

// ─── Document schemas ─────────────────────────────────────────────────────────

export const uploadDocumentSchema = z.object({
  requestId: uuidField,
});

// ─── Payment schemas ──────────────────────────────────────────────────────────

export const initiatePaymentSchema = z.object({
  requestId: uuidField,
  phoneNumber: z
    .string()
    .regex(/^\+?254[0-9]{9}$/, 'Invalid Kenyan phone number format'),
  amount: z
    .number({ invalid_type_error: 'Amount must be a number' })
    .positive('Amount must be positive')
    .max(1_000_000, 'Amount must not exceed 1,000,000'),
});

// ─── Query parameter schemas ──────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().positive().default(1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .pipe(z.number().int().positive().max(100).default(50)),
});

export const auditLogQuerySchema = z.object({
  userId: uuidField.optional(),
  action: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)),
});

// ─── Type exports ─────────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

// User types
export enum UserRole {
  STUDENT = 'STUDENT',
  ADMIN_LEVEL_1 = 'ADMIN_LEVEL_1',
  ADMIN_LEVEL_2 = 'ADMIN_LEVEL_2',
  SUPERADMIN = 'SUPERADMIN'
}

export enum AccountStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  DEACTIVATED = 'DEACTIVATED',
  REJECTED = 'REJECTED'
}

// Request types
export enum RequestStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  PENDING_DOCUMENTS = 'PENDING_DOCUMENTS',
  APPROVED = 'APPROVED',
  VERIFIED = 'VERIFIED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  FLAGGED = 'FLAGGED',
  ARCHIVED = 'ARCHIVED'
}

export enum RequestType {
  SCHOOL_FEES = 'SCHOOL_FEES',
  MEDICAL_EXPENSES = 'MEDICAL_EXPENSES',
  SUPPLIES = 'SUPPLIES',
  EMERGENCY = 'EMERGENCY',
  OTHER = 'OTHER'
}

// Audit action types
export enum AuditAction {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGIN_FAILED = 'USER_LOGIN_FAILED',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_CREATED = 'USER_CREATED',
  USER_APPROVED = 'USER_APPROVED',
  USER_REJECTED = 'USER_REJECTED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  USER_REACTIVATED = 'USER_REACTIVATED',
  USER_UPDATED = 'USER_UPDATED',
  REQUEST_CREATED = 'REQUEST_CREATED',
  REQUEST_STATUS_CHANGED = 'REQUEST_STATUS_CHANGED',
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  DOCUMENT_ACCESSED = 'DOCUMENT_ACCESSED',
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  REPORT_GENERATED = 'REPORT_GENERATED'
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// Request context
export interface RequestContext {
  user?: JWTPayload;
  ipAddress: string;
  userAgent: string;
}

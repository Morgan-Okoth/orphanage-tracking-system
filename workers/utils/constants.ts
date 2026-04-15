// File upload constraints
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

// Rate limiting
export const RATE_LIMIT_PUBLIC = 100; // requests per 15 minutes
export const RATE_LIMIT_AUTHENTICATED = 1000; // requests per 15 minutes
export const RATE_LIMIT_UPLOAD = 10; // requests per 15 minutes
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes in milliseconds

// Pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

// Token expiry
export const ACCESS_TOKEN_EXPIRY = 3600; // 1 hour in seconds
export const REFRESH_TOKEN_EXPIRY = 604800; // 7 days in seconds

// Password requirements
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 100;

// Request amount limits
export const MAX_REQUEST_AMOUNT = 1000000; // KES 1,000,000

// Archival period
export const ARCHIVAL_PERIOD_DAYS = 90;

// Notification retry
export const MAX_NOTIFICATION_RETRIES = 3;

// API version
export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;

// CORS origins (update for production)
export const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8787',
  'https://your-production-domain.com'
];

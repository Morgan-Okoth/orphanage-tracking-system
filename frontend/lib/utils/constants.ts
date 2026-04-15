const isBrowser = typeof window !== 'undefined';
const isLocalHost =
  isBrowser &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (isLocalHost
    ? 'http://localhost:8787/api/v1'
    : 'https://financial-transparency-api.morgan-ent.workers.dev/api/v1');

export const REQUEST_TYPE_LABELS = {
  SCHOOL_FEES: 'School Fees',
  MEDICAL_EXPENSES: 'Medical Expenses',
  SUPPLIES: 'Supplies',
  EMERGENCY: 'Emergency',
  OTHER: 'Other',
};

export const REQUEST_STATUS_LABELS = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  PENDING_DOCUMENTS: 'Pending Documents',
  APPROVED: 'Approved',
  VERIFIED: 'Verified',
  PAID: 'Paid',
  REJECTED: 'Rejected',
  FLAGGED: 'Flagged',
  ARCHIVED: 'Archived',
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

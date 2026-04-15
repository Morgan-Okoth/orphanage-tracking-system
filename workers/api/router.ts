import { Hono } from 'hono';
import { authHandlers } from '../handlers/auth';
import { userHandlers } from '../handlers/users';
import { documentHandlers } from '../handlers/documents';
import { requestHandlers } from '../handlers/requests';
import { paymentHandlers } from '../handlers/payments';
import notificationHandlers from '../handlers/notifications';
import adminHandlers from '../handlers/admin';
import auditHandlers from '../handlers/audit';
import publicHandlers from '../handlers/public';
import reportHandlers from '../handlers/reports';
import archivalHandlers from '../handlers/archival';
import { authMiddleware, requireRole, requirePermission } from './middleware/auth';
import { UserRole } from '../types';

export const router = new Hono();

// Health check endpoint
router.get('/health', (c) => {
  return c.json({ status: 'ok', message: 'API is running' });
});

// Authentication routes (public)
router.post('/api/v1/auth/register', authHandlers.register);
router.post('/api/v1/auth/login', authHandlers.login);
router.post('/api/v1/auth/refresh-token', authHandlers.refreshToken);

// Protected authentication routes
router.post('/api/v1/auth/logout', authMiddleware(), authHandlers.logout);
router.get('/api/v1/auth/me', authMiddleware(), authHandlers.getCurrentUserProfile);

// User management routes
router.get(
  '/api/v1/users',
  authMiddleware(),
  requirePermission('user:read:all'),
  userHandlers.listUsers
);

router.get(
  '/api/v1/users/pending',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.SUPERADMIN),
  userHandlers.listPendingUsers
);

router.get(
  '/api/v1/users/:id',
  authMiddleware(),
  userHandlers.getUserById
);

router.patch(
  '/api/v1/users/:id',
  authMiddleware(),
  userHandlers.updateUser
);

router.post(
  '/api/v1/users/:id/approve',
  authMiddleware(),
  requirePermission('user:approve'),
  userHandlers.approveUser
);

router.post(
  '/api/v1/users/:id/reject',
  authMiddleware(),
  requirePermission('user:approve'),
  userHandlers.rejectUser
);

router.delete(
  '/api/v1/users/:id',
  authMiddleware(),
  requirePermission('user:deactivate'),
  userHandlers.deactivateUser
);

router.post(
  '/api/v1/users/:id/reactivate',
  authMiddleware(),
  requirePermission('user:deactivate'),
  userHandlers.reactivateUser
);

// Document management routes
router.post(
  '/api/v1/documents',
  authMiddleware(),
  requirePermission('document:upload:own'),
  documentHandlers.uploadDocument
);

router.get(
  '/api/v1/documents/:id',
  authMiddleware(),
  documentHandlers.getDocumentMetadata
);

router.get(
  '/api/v1/documents/:id/download',
  authMiddleware(),
  documentHandlers.downloadDocument
);

router.get(
  '/api/v1/requests/:id/documents',
  authMiddleware(),
  documentHandlers.listRequestDocuments
);

router.delete(
  '/api/v1/documents/:id',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN),
  documentHandlers.deleteDocument
);

// Request management routes
router.post(
  '/api/v1/requests',
  authMiddleware(),
  requireRole(UserRole.STUDENT),
  requestHandlers.createRequest
);

router.get(
  '/api/v1/requests',
  authMiddleware(),
  requestHandlers.listRequests
);

// Archived requests — MUST be registered before /api/v1/requests/:id to avoid param collision
router.get(
  '/api/v1/requests/archived',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN),
  archivalHandlers.listArchivedRequests
);

router.get(
  '/api/v1/requests/archived/:id',
  authMiddleware(),
  archivalHandlers.getArchivedRequest
);

router.get(
  '/api/v1/requests/:id',
  authMiddleware(),
  requestHandlers.getRequestById
);

router.patch(
  '/api/v1/requests/:id',
  authMiddleware(),
  requireRole(UserRole.STUDENT),
  requestHandlers.updateRequest
);

router.delete(
  '/api/v1/requests/:id',
  authMiddleware(),
  requireRole(UserRole.STUDENT),
  requestHandlers.deleteRequest
);

router.get(
  '/api/v1/requests/:id/history',
  authMiddleware(),
  requestHandlers.getRequestHistory
);

// Request workflow routes (Admin Level 1)
router.post(
  '/api/v1/requests/:id/review',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.SUPERADMIN),
  requestHandlers.startReview
);

router.post(
  '/api/v1/requests/:id/approve',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.SUPERADMIN),
  requestHandlers.approveRequest
);

router.post(
  '/api/v1/requests/:id/reject',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN),
  requestHandlers.rejectRequest
);

router.post(
  '/api/v1/requests/:id/request-docs',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.SUPERADMIN),
  requestHandlers.requestAdditionalDocuments
);

// Request workflow routes (Admin Level 2)
router.post(
  '/api/v1/requests/:id/verify',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN),
  requestHandlers.verifyRequest
);

router.post(
  '/api/v1/requests/:id/flag',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN),
  requestHandlers.flagRequest
);

// Comment routes
router.post(
  '/api/v1/requests/:id/comments',
  authMiddleware(),
  requestHandlers.addComment
);

router.get(
  '/api/v1/requests/:id/comments',
  authMiddleware(),
  requestHandlers.getComments
);

// Payment routes
router.post(
  '/api/v1/payments/initiate',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.SUPERADMIN),
  paymentHandlers.initiatePayment
);

router.post(
  '/api/v1/payments/webhook',
  paymentHandlers.handleWebhook
);

router.get(
  '/api/v1/payments/:id',
  authMiddleware(),
  paymentHandlers.getPaymentById
);

router.get(
  '/api/v1/payments/request/:requestId',
  authMiddleware(),
  paymentHandlers.getPaymentByRequestId
);

router.get(
  '/api/v1/payments',
  authMiddleware(),
  requireRole(UserRole.ADMIN_LEVEL_1, UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN),
  paymentHandlers.listPayments
);

// Notification routes
router.route('/api/v1/notifications', notificationHandlers);

// Admin dashboard routes
router.route('/api/v1/admin', adminHandlers);

// Audit log routes (ADMIN_LEVEL_2 only)
router.route('/api/v1/audit-logs', auditHandlers);

// Public transparency routes (no auth required)
router.route('/api/v1/public', publicHandlers);

// Reporting routes (ADMIN_LEVEL_2 only)
router.route('/api/v1/reports', reportHandlers);

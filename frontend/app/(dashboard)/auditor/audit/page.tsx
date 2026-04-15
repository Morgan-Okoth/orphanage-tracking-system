'use client';

import { Box, Typography } from '@mui/material';
import { UserRole } from '../../../../lib/types/user';
import ProtectedRoute from '../../../../components/auth/ProtectedRoute';
import AuditLogViewer from '../../../../components/admin/AuditLogViewer';

function AuditLogContent() {
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={1}>
        Audit Logs
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Full audit trail of all system actions. Filter by user, action type, or date range.
      </Typography>
      <AuditLogViewer />
    </Box>
  );
}

export default function AuditLogPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN]}>
      <AuditLogContent />
    </ProtectedRoute>
  );
}

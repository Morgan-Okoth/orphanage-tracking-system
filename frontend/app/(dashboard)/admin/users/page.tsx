import { Box, Typography, Divider, Button } from '@mui/material';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import Link from 'next/link';
import UserManagement from '../../../../components/admin/UserManagement';
import ProtectedRoute from '../../../../components/auth/ProtectedRoute';
import { UserRole } from '../../../../lib/types/user';

export default function UsersPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN_LEVEL_1]}>
      <Box>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
          <Typography variant="h5" fontWeight={700}>
            User Management
          </Typography>
          <Button
            component={Link}
            href="/admin/users/pending"
            variant="outlined"
            startIcon={<PendingActionsIcon />}
          >
            Pending Approvals
          </Button>
        </Box>
        <Divider sx={{ mb: 3 }} />
        <UserManagement />
      </Box>
    </ProtectedRoute>
  );
}

import { Box, Typography, Divider } from '@mui/material';
import AdminDashboardContent from './AdminDashboardContent';

export default function AdminDashboardPage() {
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>
        Admin Dashboard
      </Typography>
      <Divider sx={{ mb: 3 }} />
      <AdminDashboardContent />
    </Box>
  );
}

'use client';

import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Button,
  Divider,
  Chip,
} from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { auditorApi } from '../../../lib/api/auditor';
import { UserRole } from '../../../lib/types/user';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import RequestCard from '../../../components/requests/RequestCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

function StatCard({
  label,
  value,
  color,
  icon,
  isLoading,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
  isLoading?: boolean;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={1}>
          <Box color={color}>{icon}</Box>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Stack>
        {isLoading ? (
          <Skeleton variant="text" width={60} height={40} />
        ) : (
          <Typography variant="h4" fontWeight={700} color={color}>
            {value}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function AuditorDashboardContent() {
  const router = useRouter();

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['auditor-dashboard'],
    queryFn: () => auditorApi.getDashboardStats(),
  });

  const { data: approvedData, isLoading: approvedLoading } = useQuery({
    queryKey: ['auditor-approved', 1],
    queryFn: () => auditorApi.listApprovedRequests(1, 5),
  });

  const { data: flaggedData, isLoading: flaggedLoading } = useQuery({
    queryKey: ['auditor-flagged', 1],
    queryFn: () => auditorApi.listFlaggedRequests(1, 5),
  });

  const stats = statsData?.data;
  const approvedItems = approvedData?.data?.items ?? [];
  const flaggedItems = flaggedData?.data?.items ?? [];

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>
        Auditor Dashboard
      </Typography>

      {/* Stats */}
      <Grid container spacing={2} mb={4}>
        <Grid item xs={12} sm={4}>
          <StatCard
            label="Flagged Cases"
            value={stats?.flaggedCasesCount ?? 0}
            color="error.main"
            icon={<FlagIcon />}
            isLoading={statsLoading}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            label="Pending Verifications"
            value={stats?.pendingVerificationsCount ?? 0}
            color="warning.main"
            icon={<VerifiedUserIcon />}
            isLoading={statsLoading}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            label="Recent Anomalies"
            value={stats?.recentAnomaliesCount ?? 0}
            color="secondary.main"
            icon={<WarningAmberIcon />}
            isLoading={statsLoading}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Pending Verifications */}
        <Grid item xs={12} md={6}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight={600}>
                Pending Verifications
              </Typography>
              <Button
                component={Link}
                href="/auditor/verify"
                endIcon={<ArrowForwardIcon />}
                size="small"
              >
                View All
              </Button>
            </Stack>
            <Divider sx={{ mb: 2 }} />
            {approvedLoading ? (
              <LoadingSpinner />
            ) : approvedItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No requests pending verification.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {approvedItems.map((req) => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    onClick={() => router.push(`/auditor/verify/${req.id}`)}
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Grid>

        {/* Flagged Cases */}
        <Grid item xs={12} md={6}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight={600}>
                Flagged Cases
              </Typography>
              <Button
                component={Link}
                href="/auditor/flagged"
                endIcon={<ArrowForwardIcon />}
                size="small"
              >
                View All
              </Button>
            </Stack>
            <Divider sx={{ mb: 2 }} />
            {flaggedLoading ? (
              <LoadingSpinner />
            ) : flaggedItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No flagged cases.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {flaggedItems.map((req) => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    onClick={() => router.push(`/auditor/verify/${req.id}`)}
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* Quick links */}
      <Box mt={4}>
        <Typography variant="h6" fontWeight={600} mb={2}>
          Quick Actions
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Button variant="outlined" component={Link} href="/auditor/reports" startIcon={<WarningAmberIcon />}>
            View Anomaly Reports
          </Button>
          <Button variant="outlined" component={Link} href="/auditor/audit" startIcon={<Chip label="LOG" size="small" />}>
            View Audit Logs
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

export default function AuditorDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN]}>
      <AuditorDashboardContent />
    </ProtectedRoute>
  );
}

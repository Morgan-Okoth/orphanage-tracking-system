'use client';

import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Alert,
  Grid,
  Divider,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { auditorApi, Anomaly } from '../../../../lib/api/auditor';
import { UserRole } from '../../../../lib/types/user';
import ProtectedRoute from '../../../../components/auth/ProtectedRoute';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import { format } from 'date-fns';

const SEVERITY_CONFIG = {
  HIGH: { color: 'error' as const, icon: <ErrorOutlineIcon fontSize="small" /> },
  MEDIUM: { color: 'warning' as const, icon: <WarningAmberIcon fontSize="small" /> },
  LOW: { color: 'info' as const, icon: <InfoOutlinedIcon fontSize="small" /> },
};

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  REPEATED_REQUEST: 'Repeated Request',
  AMOUNT_OUTLIER: 'Amount Outlier',
  SUSPICIOUS_PATTERN: 'Suspicious Pattern',
};

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const router = useRouter();
  const severity = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.LOW;

  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: 4,
        borderLeftColor: `${severity.color}.main`,
        cursor: anomaly.affectedRequestId ? 'pointer' : 'default',
        '&:hover': anomaly.affectedRequestId ? { bgcolor: 'action.hover' } : {},
      }}
      onClick={() => {
        if (anomaly.affectedRequestId) {
          router.push(`/auditor/verify/${anomaly.affectedRequestId}`);
        }
      }}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box color={`${severity.color}.main`}>{severity.icon}</Box>
            <Typography variant="subtitle2" fontWeight={600}>
              {ANOMALY_TYPE_LABELS[anomaly.type] ?? anomaly.type}
            </Typography>
          </Stack>
          <Chip
            label={anomaly.severity}
            color={severity.color}
            size="small"
            variant="outlined"
          />
        </Stack>

        <Typography variant="body2" color="text.secondary" mb={1}>
          {anomaly.description}
        </Typography>

        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Detected {(() => {
              try {
                if (!anomaly.detectedAt) return 'N/A';
                const date = new Date(anomaly.detectedAt);
                if (isNaN(date.getTime())) return 'Invalid date';
                return format(date, 'MMM d, yyyy HH:mm');
              } catch {
                return 'Invalid date';
              }
            })()}
          </Typography>
          {anomaly.affectedRequestId && (
            <Chip
              label={`Request: ${anomaly.affectedRequestId.slice(0, 8)}...`}
              size="small"
              variant="outlined"
              clickable
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ReportsContent() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['anomalies'],
    queryFn: () => auditorApi.getAnomalies(),
  });

  const anomalies = data?.data ?? [];

  const high = anomalies.filter((a) => a.severity === 'HIGH');
  const medium = anomalies.filter((a) => a.severity === 'MEDIUM');
  const low = anomalies.filter((a) => a.severity === 'LOW');

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={1}>
        Anomaly Detection Reports
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Automatically detected patterns that may require investigation.
      </Typography>

      {isLoading && <LoadingSpinner />}
      {isError && <Alert severity="error">Failed to load anomaly reports.</Alert>}

      {!isLoading && !isError && anomalies.length === 0 && (
        <Alert severity="success">No anomalies detected at this time.</Alert>
      )}

      {anomalies.length > 0 && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={4}>
            <Card variant="outlined" sx={{ textAlign: 'center', p: 1 }}>
              <Typography variant="h4" fontWeight={700} color="error.main">{high.length}</Typography>
              <Typography variant="caption" color="text.secondary">High Severity</Typography>
            </Card>
          </Grid>
          <Grid item xs={4}>
            <Card variant="outlined" sx={{ textAlign: 'center', p: 1 }}>
              <Typography variant="h4" fontWeight={700} color="warning.main">{medium.length}</Typography>
              <Typography variant="caption" color="text.secondary">Medium Severity</Typography>
            </Card>
          </Grid>
          <Grid item xs={4}>
            <Card variant="outlined" sx={{ textAlign: 'center', p: 1 }}>
              <Typography variant="h4" fontWeight={700} color="info.main">{low.length}</Typography>
              <Typography variant="caption" color="text.secondary">Low Severity</Typography>
            </Card>
          </Grid>
        </Grid>
      )}

      {high.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" fontWeight={600} color="error.main" mb={1}>
            High Severity
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={1.5}>
            {high.map((a) => <AnomalyCard key={a.id} anomaly={a} />)}
          </Stack>
        </Box>
      )}

      {medium.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" fontWeight={600} color="warning.main" mb={1}>
            Medium Severity
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={1.5}>
            {medium.map((a) => <AnomalyCard key={a.id} anomaly={a} />)}
          </Stack>
        </Box>
      )}

      {low.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" fontWeight={600} color="info.main" mb={1}>
            Low Severity
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={1.5}>
            {low.map((a) => <AnomalyCard key={a.id} anomaly={a} />)}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN]}>
      <ReportsContent />
    </ProtectedRoute>
  );
}

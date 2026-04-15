'use client';

import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Chip,
} from '@mui/material';
import {
  AccountBalance as AccountBalanceIcon,
  Payments as PaymentsIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { publicApi, PublicStatistics, MonthlyStatistic } from '../../lib/api/public';
import StatisticsCard from './StatisticsCard';
import FundingChart from './FundingChart';
import LoadingSpinner from '../common/LoadingSpinner';
import LazySection from '../common/LazySection';
import { REQUEST_TYPE_LABELS } from '../../lib/utils/constants';

function formatKES(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMonth(month: string): string {
  if (month.length === 7) {
    return new Date(`${month}-01`).toLocaleDateString('en-KE', {
      month: 'long',
      year: 'numeric',
    });
  }
  return month;
}

function DistributionChart({ amountsByType }: { amountsByType: Record<string, number> }) {
  const total = Object.values(amountsByType).reduce((sum, v) => sum + v, 0);
  const colors = ['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#d32f2f'];
  const entries = Object.entries(amountsByType);

  return (
    <Box>
      {entries.map(([type, amount], idx) => {
        const pct = total > 0 ? (amount / total) * 100 : 0;
        const label = REQUEST_TYPE_LABELS[type as keyof typeof REQUEST_TYPE_LABELS] ?? type;
        const color = colors[idx % colors.length];
        return (
          <Box key={type} mb={1.5}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="body2">{label}</Typography>
              <Typography variant="body2" fontWeight={600}>
                {formatKES(amount)} ({pct.toFixed(1)}%)
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{
                height: 10,
                borderRadius: 1,
                bgcolor: `${color}22`,
                '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}

export default function PublicDashboard() {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<PublicStatistics>({
    queryKey: ['public', 'statistics'],
    queryFn: publicApi.getStatistics,
  });

  const {
    data: monthly,
    isLoading: monthlyLoading,
  } = useQuery<MonthlyStatistic[]>({
    queryKey: ['public', 'statistics', 'monthly'],
    queryFn: publicApi.getMonthlyStatistics,
  });

  if (statsLoading) return <LoadingSpinner />;

  if (statsError) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load transparency data. Please try again later.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatisticsCard
            title="Total Received"
            value={stats ? formatKES(stats.totalReceived) : '—'}
            subtitle="All-time donations received"
            icon={AccountBalanceIcon}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatisticsCard
            title="Total Disbursed"
            value={stats ? formatKES(stats.totalDisbursed) : '—'}
            subtitle="All-time funds disbursed"
            icon={PaymentsIcon}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatisticsCard
            title="Requests Approved"
            value={stats?.requestsApproved ?? '—'}
            subtitle="Successfully funded requests"
            icon={CheckCircleIcon}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatisticsCard
            title="Requests Rejected"
            value={stats?.requestsRejected ?? '—'}
            subtitle="Declined requests"
            icon={CancelIcon}
            color="#d32f2f"
          />
        </Grid>
      </Grid>

      {/* Charts Row */}
      <LazySection skeletonHeight={350}>
        <Grid container spacing={3} mb={4}>
          {/* Monthly Funding Trends */}
          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Monthly Funding Trends
                </Typography>
                {monthlyLoading ? (
                  <LoadingSpinner />
                ) : (
                  <FundingChart data={monthly ?? []} />
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Distribution by Type */}
          <Grid item xs={12} md={5}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Distribution by Request Type
                </Typography>
                {stats?.amountsByType ? (
                  <DistributionChart amountsByType={stats.amountsByType} />
                ) : (
                  <Typography color="text.secondary">No data available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </LazySection>

      {/* Monthly Breakdown Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Monthly Breakdown
          </Typography>
          {monthlyLoading ? (
            <LoadingSpinner />
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell><strong>Month</strong></TableCell>
                    <TableCell align="right"><strong>Received (KES)</strong></TableCell>
                    <TableCell align="right"><strong>Disbursed (KES)</strong></TableCell>
                    <TableCell align="right"><strong>Approved</strong></TableCell>
                    <TableCell align="right"><strong>Rejected</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(monthly ?? []).map((row) => (
                    <TableRow key={row.month} hover>
                      <TableCell>{formatMonth(row.month)}</TableCell>
                      <TableCell align="right">{formatKES(row.totalReceived)}</TableCell>
                      <TableCell align="right">{formatKES(row.totalDisbursed)}</TableCell>
                      <TableCell align="right">
                        <Chip label={row.requestsApproved} size="small" color="success" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        <Chip label={row.requestsRejected} size="small" color="error" variant="outlined" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!monthly || monthly.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography color="text.secondary" py={2}>No monthly data available</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

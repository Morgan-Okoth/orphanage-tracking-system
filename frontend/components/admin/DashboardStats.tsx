'use client';

import { Grid, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { DashboardStats as Stats } from '../../lib/api/admin';
import { RequestStatus } from '../../lib/types/request';

interface Props {
  stats?: Stats;
  isLoading?: boolean;
}

const statCards = [
  {
    label: 'Submitted',
    getValue: (s: Stats) => s.requestsByStatus[RequestStatus.SUBMITTED] ?? 0,
    color: 'info.main',
  },
  {
    label: 'Under Review',
    getValue: (s: Stats) => s.requestsByStatus[RequestStatus.UNDER_REVIEW] ?? 0,
    color: 'primary.main',
  },
  {
    label: 'Pending Documents',
    getValue: (s: Stats) => s.requestsByStatus[RequestStatus.PENDING_DOCUMENTS] ?? 0,
    color: 'warning.main',
  },
  {
    label: 'Approved',
    getValue: (s: Stats) => s.requestsByStatus[RequestStatus.APPROVED] ?? 0,
    color: 'success.main',
  },
  {
    label: 'Rejected',
    getValue: (s: Stats) => s.requestsByStatus[RequestStatus.REJECTED] ?? 0,
    color: 'error.main',
  },
  {
    label: 'Disbursed This Month',
    getValue: (s: Stats) => `KES ${s.totalDisbursedThisMonth.toLocaleString()}`,
    color: 'secondary.main',
  },
];

function StatCard({
  label,
  value,
  color,
  isLoading,
}: {
  label: string;
  value: string | number;
  color: string;
  isLoading?: boolean;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {label}
        </Typography>
        {isLoading ? (
          <Skeleton variant="text" width={80} height={40} />
        ) : (
          <Typography variant="h4" fontWeight={700} color={color}>
            {value}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardStats({ stats, isLoading }: Props) {
  return (
    <Grid container spacing={2}>
      {statCards.map(({ label, getValue, color }) => (
        <Grid item xs={12} sm={6} md={4} lg={2} key={label}>
          <StatCard
            label={label}
            value={stats ? getValue(stats) : 0}
            color={color}
            isLoading={isLoading}
          />
        </Grid>
      ))}
    </Grid>
  );
}

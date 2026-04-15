'use client';

import { Box, Typography, Paper, List, ListItem, ListItemText, Chip, Stack } from '@mui/material';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../lib/api/admin';
import { RequestStatus } from '../../../lib/types/request';
import DashboardStats from '../../../components/admin/DashboardStats';
import AdminRequestList from '../../../components/admin/AdminRequestList';

const ATTENTION_STATUSES = [
  RequestStatus.SUBMITTED,
  RequestStatus.UNDER_REVIEW,
  RequestStatus.PENDING_DOCUMENTS,
];

export default function AdminDashboardContent() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => adminApi.getDashboardStats(),
  });

  const pendingActions = data?.data?.pendingActions;

  return (
    <Box>
      <DashboardStats stats={data?.data} isLoading={isLoading} />

      <Box mt={4}>
        <Typography variant="h6" fontWeight={600} mb={2}>
          Requests Needing Attention
        </Typography>
        <AdminRequestList
          statusFilter={ATTENTION_STATUSES}
          limit={10}
          showViewAll
        />
      </Box>

      {pendingActions && pendingActions.length > 0 && (
        <Box mt={4}>
          <Typography variant="h6" fontWeight={600} mb={2}>
            Pending Actions
          </Typography>
          <Paper variant="outlined">
            <List disablePadding>
              {pendingActions.map((action, index) => (
                <ListItem
                  key={action.requestId}
                  divider={index < pendingActions.length - 1}
                  component={Link}
                  href={`/admin/requests/${action.requestId}`}
                  sx={{ textDecoration: 'none', color: 'inherit', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={500}>
                          {action.studentName ?? 'Unknown Student'}
                        </Typography>
                        <Chip label={action.type} size="small" variant="outlined" />
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={2} mt={0.5}>
                        <Typography variant="caption" color="text.secondary">
                          KES {action.amount.toLocaleString()}
                        </Typography>
                        <Typography variant="caption" color="warning.main">
                          {action.actionRequired}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Box>
      )}
    </Box>
  );
}

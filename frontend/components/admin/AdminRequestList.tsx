'use client';

import { Box, Stack, Skeleton, Typography, Button } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../lib/api/admin';
import { RequestStatus } from '../../lib/types/request';
import RequestCard from '../requests/RequestCard';

interface Props {
  statusFilter?: RequestStatus[];
  limit?: number;
  showViewAll?: boolean;
}

export default function AdminRequestList({ statusFilter, limit = 20, showViewAll }: Props) {
  const router = useRouter();

  // Fetch for each status in the filter, or a single unfilitered fetch
  const statuses = statusFilter && statusFilter.length > 0 ? statusFilter : [undefined];

  // We fetch the first status only for simplicity when multiple statuses are provided;
  // the backend supports one status filter at a time, so we fetch all and merge client-side.
  const queries = statuses.map((status) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['admin-requests', status ?? 'all', limit],
      queryFn: () => adminApi.listRequests({ status, limit, page: 1 }),
    }),
  );

  const isLoading = queries.some((q) => q.isLoading);
  const allItems = queries.flatMap((q) => q.data?.data?.items ?? []);

  // Sort oldest first
  const sorted = [...allItems].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
  );

  const items = sorted.slice(0, limit);

  if (isLoading) {
    return (
      <Stack spacing={1.5}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={90} />
        ))}
      </Stack>
    );
  }

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No requests found.
      </Typography>
    );
  }

  return (
    <Box>
      <Stack spacing={1.5}>
        {items.map((req) => (
          <RequestCard
            key={req.id}
            request={req}
            onClick={() => router.push(`/admin/requests/${req.id}`)}
          />
        ))}
      </Stack>
      {showViewAll && (
        <Box mt={2} textAlign="right">
          <Button
            component={Link}
            href="/admin/requests"
            endIcon={<ArrowForwardIcon />}
            size="small"
          >
            View All
          </Button>
        </Box>
      )}
    </Box>
  );
}

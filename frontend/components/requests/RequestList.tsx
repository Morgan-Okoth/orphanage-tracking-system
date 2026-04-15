'use client';

import { Stack, Typography, Pagination, Box } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { requestsApi } from '../../lib/api/requests';
import RequestCard from './RequestCard';
import LoadingSpinner from '../common/LoadingSpinner';

export default function RequestList() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['requests', page],
    queryFn: () => requestsApi.list(page, 10),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError)
    return (
      <Typography color="error">Failed to load requests. Please try again.</Typography>
    );

  const items = data?.data?.items ?? [];
  const totalPages = data?.data?.pagination?.totalPages ?? 1;

  if (items.length === 0) {
    return (
      <Box textAlign="center" py={6}>
        <Typography color="text.secondary">No requests yet.</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {items.map((req) => (
        <RequestCard
          key={req.id}
          request={req}
          onClick={() => router.push(`/student/requests/${req.id}`)}
        />
      ))}
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" pt={1}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, v) => setPage(v)}
            color="primary"
          />
        </Box>
      )}
    </Stack>
  );
}

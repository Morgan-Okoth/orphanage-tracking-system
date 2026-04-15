'use client';

import { useState } from 'react';
import { Box, Typography, Stack, Chip } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../../lib/api/admin';
import { RequestStatus } from '../../../../lib/types/request';
import RequestCard from '../../../../components/requests/RequestCard';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';

const STATUS_FILTERS: { label: string; value: RequestStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Submitted', value: RequestStatus.SUBMITTED },
  { label: 'Under Review', value: RequestStatus.UNDER_REVIEW },
  { label: 'Pending Docs', value: RequestStatus.PENDING_DOCUMENTS },
  { label: 'Approved', value: RequestStatus.APPROVED },
  { label: 'Rejected', value: RequestStatus.REJECTED },
];

export default function AdminRequestsPage() {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState<RequestStatus | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-requests', activeStatus ?? 'all', page],
    queryFn: () => adminApi.listRequests({ status: activeStatus, page, limit: 20 }),
  });

  const items = data?.data?.items ?? [];
  const pagination = data?.data?.pagination;

  const handleStatusChange = (value: RequestStatus | undefined) => {
    setActiveStatus(value);
    setPage(1);
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>
        All Requests
      </Typography>

      {/* Filter chips */}
      <Stack direction="row" spacing={1} flexWrap="wrap" mb={3}>
        {STATUS_FILTERS.map(({ label, value }) => (
          <Chip
            key={label}
            label={label}
            clickable
            color={activeStatus === value ? 'primary' : 'default'}
            variant={activeStatus === value ? 'filled' : 'outlined'}
            onClick={() => handleStatusChange(value)}
          />
        ))}
      </Stack>

      {isLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No requests found.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {items.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onClick={() => router.push(`/admin/requests/${req.id}`)}
            />
          ))}
        </Stack>
      )}

      {/* Simple pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Stack direction="row" spacing={1} justifyContent="center" mt={3}>
          <Chip
            label="Previous"
            clickable
            disabled={!pagination.hasPrev}
            onClick={() => setPage((p) => p - 1)}
          />
          <Chip label={`Page ${pagination.page} of ${pagination.totalPages}`} />
          <Chip
            label="Next"
            clickable
            disabled={!pagination.hasNext}
            onClick={() => setPage((p) => p + 1)}
          />
        </Stack>
      )}
    </Box>
  );
}

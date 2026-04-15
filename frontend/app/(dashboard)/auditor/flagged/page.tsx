'use client';

import { useState } from 'react';
import { Box, Typography, Stack, Chip } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auditorApi } from '../../../../lib/api/auditor';
import { UserRole } from '../../../../lib/types/user';
import ProtectedRoute from '../../../../components/auth/ProtectedRoute';
import RequestCard from '../../../../components/requests/RequestCard';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';

function FlaggedCasesContent() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['auditor-flagged', page],
    queryFn: () => auditorApi.listFlaggedRequests(page, 20),
  });

  const items = data?.data?.items ?? [];
  const pagination = data?.data?.pagination;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={1}>
        Flagged Cases
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Requests that have been flagged for further investigation.
      </Typography>

      {isLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No flagged cases.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {items.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onClick={() => router.push(`/auditor/verify/${req.id}`)}
            />
          ))}
        </Stack>
      )}

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

export default function FlaggedCasesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN_LEVEL_2]}>
      <FlaggedCasesContent />
    </ProtectedRoute>
  );
}

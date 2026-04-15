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

function VerificationQueueContent() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['auditor-approved', page],
    queryFn: () => auditorApi.listApprovedRequests(page, 20),
  });

  const items = data?.data?.items ?? [];
  const pagination = data?.data?.pagination;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={1}>
        Verification Queue
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Requests approved by Admin Level 1 awaiting your verification.
      </Typography>

      {isLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No requests pending verification.
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

export default function VerificationQueuePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN_LEVEL_2, UserRole.SUPERADMIN]}>
      <VerificationQueueContent />
    </ProtectedRoute>
  );
}

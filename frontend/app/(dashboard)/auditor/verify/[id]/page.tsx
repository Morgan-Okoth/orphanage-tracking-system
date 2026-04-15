'use client';

import { use, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Divider,
  Button,
  Alert,
  Grid,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import FlagIcon from '@mui/icons-material/Flag';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { auditorApi } from '../../../../../lib/api/auditor';
import { adminApi } from '../../../../../lib/api/admin';
import { RequestStatus } from '../../../../../lib/types/request';
import { UserRole } from '../../../../../lib/types/user';
import ProtectedRoute from '../../../../../components/auth/ProtectedRoute';
import RequestStatusBadge from '../../../../../components/requests/RequestStatusBadge';
import DocumentViewer from '../../../../../components/documents/DocumentViewer';
import RequestTimeline from '../../../../../components/requests/RequestTimeline';
import LoadingSpinner from '../../../../../components/common/LoadingSpinner';

const typeLabels: Record<string, string> = {
  SCHOOL_FEES: 'School Fees',
  MEDICAL_EXPENSES: 'Medical Expenses',
  SUPPLIES: 'Supplies',
  EMERGENCY: 'Emergency',
  OTHER: 'Other',
};

interface Props {
  params: Promise<{ id: string }>;
}

function VerificationDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [auditNotes, setAuditNotes] = useState('');
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auditor-request', id],
    queryFn: () => auditorApi.getRequest(id),
  });

  const verifyMutation = useMutation({
    mutationFn: () => auditorApi.verifyRequest(id, auditNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditor-request', id] });
      queryClient.invalidateQueries({ queryKey: ['auditor-approved'] });
      router.push('/auditor/verify');
    },
  });

  const flagMutation = useMutation({
    mutationFn: () => auditorApi.flagRequest(id, flagReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditor-request', id] });
      queryClient.invalidateQueries({ queryKey: ['auditor-flagged'] });
      setFlagDialogOpen(false);
      setFlagReason('');
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) return <Alert severity="error">Request not found.</Alert>;

  const req = data.data;
  const canVerify = req.status === RequestStatus.APPROVED;
  const canFlag = req.status === RequestStatus.APPROVED || req.status === RequestStatus.FLAGGED;

  return (
    <Box maxWidth={900} mx="auto">
      <Button
        component={Link}
        href="/auditor/verify"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
      >
        Back to Verification Queue
      </Button>

      <Grid container spacing={3}>
        {/* Main details */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  {typeLabels[req.type] ?? req.type}
                </Typography>
                {req.studentName && (
                  <Typography variant="body2" color="text.secondary" mt={0.5}>
                    Student: {req.studentName}
                  </Typography>
                )}
                <Typography variant="h6" color="primary" mt={0.5}>
                  KES {req.amount.toLocaleString()}
                </Typography>
              </Box>
              <RequestStatusBadge status={req.status} size="medium" />
            </Stack>

            <Typography variant="caption" color="text.secondary">
              Submitted {format(new Date(req.submittedAt), 'MMM d, yyyy HH:mm')}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
              Reason
            </Typography>
            <Typography variant="body1" mb={2}>
              {req.reason}
            </Typography>

            {req.rejectionReason && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <strong>Rejection reason:</strong> {req.rejectionReason}
              </Alert>
            )}
            {req.flagReason && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>Flag reason:</strong> {req.flagReason}
              </Alert>
            )}
          </Paper>

          {/* Documents */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Documents
            </Typography>
            <DocumentViewer requestId={id} />
          </Paper>

          {/* Audit notes & actions */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Verification Actions
            </Typography>

            <TextField
              label="Audit Notes"
              multiline
              rows={3}
              fullWidth
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              placeholder="Add notes for this verification decision..."
              sx={{ mb: 2 }}
              disabled={!canVerify}
            />

            {verifyMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Failed to verify request. Please try again.
              </Alert>
            )}
            {flagMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Failed to flag request. Please try again.
              </Alert>
            )}

            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                color="success"
                startIcon={<VerifiedUserIcon />}
                onClick={() => verifyMutation.mutate()}
                disabled={!canVerify || verifyMutation.isPending}
              >
                {verifyMutation.isPending ? 'Verifying...' : 'Verify & Approve'}
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<FlagIcon />}
                onClick={() => setFlagDialogOpen(true)}
                disabled={!canFlag || flagMutation.isPending}
              >
                Flag for Review
              </Button>
            </Stack>
          </Paper>
        </Grid>

        {/* Sidebar: status timeline */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Status History
            </Typography>
            <RequestTimeline requestId={id} />
          </Paper>
        </Grid>
      </Grid>

      {/* Flag reason dialog */}
      <Dialog open={flagDialogOpen} onClose={() => setFlagDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Flag Request for Review</DialogTitle>
        <DialogContent>
          <TextField
            label="Flag Reason"
            multiline
            rows={3}
            fullWidth
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="Describe why this request is being flagged..."
            sx={{ mt: 1 }}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFlagDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => flagMutation.mutate()}
            disabled={!flagReason.trim() || flagMutation.isPending}
          >
            {flagMutation.isPending ? 'Flagging...' : 'Flag Request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function VerificationDetailPage({ params }: Props) {
  const { id } = use(params);
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN_LEVEL_2]}>
      <VerificationDetailContent id={id} />
    </ProtectedRoute>
  );
}

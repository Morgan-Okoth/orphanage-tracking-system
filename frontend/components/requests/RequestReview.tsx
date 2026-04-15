'use client';

import { useState } from 'react';
import {
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RateReviewIcon from '@mui/icons-material/RateReview';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../lib/api/admin';
import { RequestStatus } from '../../lib/types/request';

type ActionType = 'approve' | 'reject' | 'request-docs' | null;

interface Props {
  requestId: string;
  currentStatus: RequestStatus;
  onActionComplete?: () => void;
}

const actionConfig = {
  approve: {
    title: 'Approve Request',
    label: 'Approve',
    color: 'success' as const,
    icon: <CheckCircleOutlineIcon />,
    fieldLabel: 'Comment (optional)',
    required: false,
    confirmLabel: 'Approve',
  },
  reject: {
    title: 'Reject Request',
    label: 'Reject',
    color: 'error' as const,
    icon: <CancelOutlinedIcon />,
    fieldLabel: 'Rejection reason',
    required: true,
    confirmLabel: 'Reject',
  },
  'request-docs': {
    title: 'Request Additional Documents',
    label: 'Request Docs',
    color: 'warning' as const,
    icon: <UploadFileIcon />,
    fieldLabel: 'Message to applicant',
    required: true,
    confirmLabel: 'Send Request',
  },
};

const reviewableStatuses = [
  RequestStatus.SUBMITTED,
  RequestStatus.UNDER_REVIEW,
  RequestStatus.PENDING_DOCUMENTS,
];

export default function RequestReview({ requestId, currentStatus, onActionComplete }: Props) {
  const [action, setAction] = useState<ActionType>(null);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-request', requestId] });
    queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (action === 'approve') return adminApi.approveRequest(requestId, inputValue || undefined);
      if (action === 'reject') return adminApi.rejectRequest(requestId, inputValue);
      if (action === 'request-docs') return adminApi.requestDocuments(requestId, inputValue);
    },
    onSuccess: () => {
      invalidateQueries();
      setAction(null);
      setInputValue('');
      onActionComplete?.();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const startReviewMutation = useMutation({
    mutationFn: () => adminApi.startReview(requestId),
    onSuccess: () => {
      invalidateQueries();
      onActionComplete?.();
    },
  });

  const handleClose = () => {
    setAction(null);
    setInputValue('');
    setError('');
  };

  const handleConfirm = () => {
    if (!action) return;
    const cfg = actionConfig[action];
    if (cfg.required && !inputValue.trim()) {
      setError(`${cfg.fieldLabel} is required.`);
      return;
    }
    setError('');
    mutation.mutate();
  };

  if (!reviewableStatuses.includes(currentStatus)) {
    return (
      <Typography variant="body2" color="text.secondary">
        This request has already been processed.
      </Typography>
    );
  }

  const cfg = action ? actionConfig[action] : null;
  const isSubmitted = currentStatus === RequestStatus.SUBMITTED;
  const canReview = currentStatus === RequestStatus.UNDER_REVIEW || currentStatus === RequestStatus.PENDING_DOCUMENTS;

  return (
    <>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {isSubmitted && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<RateReviewIcon />}
            onClick={() => startReviewMutation.mutate()}
            disabled={startReviewMutation.isPending}
            size="small"
          >
            {startReviewMutation.isPending ? 'Starting…' : 'Start Review'}
          </Button>
        )}
        {canReview && (
          <>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleOutlineIcon />}
              onClick={() => setAction('approve')}
              size="small"
            >
              Approve
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={<CancelOutlinedIcon />}
              onClick={() => setAction('reject')}
              size="small"
            >
              Reject
            </Button>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<UploadFileIcon />}
              onClick={() => setAction('request-docs')}
              size="small"
            >
              Request Docs
            </Button>
          </>
        )}
      </Stack>

      <Dialog open={!!action} onClose={handleClose} maxWidth="sm" fullWidth>
        {cfg && (
          <>
            <DialogTitle>{cfg.title}</DialogTitle>
            <DialogContent>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <TextField
                fullWidth
                multiline
                minRows={3}
                label={cfg.fieldLabel}
                required={cfg.required}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                sx={{ mt: 1 }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color={cfg.color}
                onClick={handleConfirm}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Processing…' : cfg.confirmLabel}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}

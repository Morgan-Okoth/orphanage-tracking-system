'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Alert,
  Typography,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestsApi } from '../../lib/api/requests';

interface Props {
  requestId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function DisputeForm({ requestId, open, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => requestsApi.raiseDispute(requestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['student-requests'] });
      setReason('');
      onSuccess?.();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length >= 10) {
      mutation.mutate();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="error" />
          Raise Payment Dispute
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Important Notice
            </Typography>
            <Typography variant="body2">
              Only raise a dispute if you have NOT received the funds. False disputes may result in account suspension. 
              This action will be reviewed by administrators.
            </Typography>
          </Alert>
          
          <DialogContentText sx={{ mb: 2 }}>
            Please provide detailed information about why you are disputing this payment. 
            Include any relevant details such as:
          </DialogContentText>
          
          <Box component="ul" sx={{ pl: 2, mb: 2, color: 'text.secondary' }}>
            <li>Expected payment date</li>
            <li>Phone number used for payment</li>
            <li>Any M-Pesa messages received</li>
            <li>Other relevant details</li>
          </Box>

          <TextField
            autoFocus
            multiline
            rows={4}
            fullWidth
            label="Dispute Reason"
            placeholder="I have not received the payment to my M-Pesa number..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reason.length > 0 && reason.length < 10}
            helperText={
              reason.length > 0 && reason.length < 10
                ? 'Reason must be at least 10 characters'
                : `${reason.length}/500 characters`
            }
            inputProps={{ maxLength: 500 }}
            required
          />

          {mutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to raise dispute'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="error"
            disabled={reason.trim().length < 10 || mutation.isPending}
          >
            {mutation.isPending ? 'Submitting...' : 'Raise Dispute'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Chip,
  Stack,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestsApi } from '../../lib/api/requests';
import { Request } from '../../lib/types/request';

interface Props {
  request: Request;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function DisputeResolution({ request, open, onClose, onSuccess }: Props) {
  const [resolution, setResolution] = useState('');
  const [action, setAction] = useState<'refund' | 'confirm' | 'investigate'>('investigate');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => requestsApi.resolveDispute(request.id, resolution, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-request', request.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
      setResolution('');
      setAction('investigate');
      onSuccess?.();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (resolution.trim().length >= 10) {
      mutation.mutate();
    }
  };

  const handleActionChange = (event: SelectChangeEvent) => {
    setAction(event.target.value as 'refund' | 'confirm' | 'investigate');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GavelIcon color="primary" />
          Resolve Payment Dispute
        </DialogTitle>
        <DialogContent>
          {/* Dispute Details */}
          <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Dispute Details
            </Typography>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Request ID:</Typography>
                <Typography variant="body2" fontFamily="monospace">{request.id}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Amount:</Typography>
                <Typography variant="body2" fontWeight={600}>
                  KES {request.amount.toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Raised:</Typography>
                <Typography variant="body2">
                  {request.disputeRaisedAt 
                    ? new Date(request.disputeRaisedAt).toLocaleString() 
                    : 'Unknown'}
                </Typography>
              </Box>
            </Stack>
          </Box>

          {/* Student's Dispute Reason */}
          <Box sx={{ mb: 3, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom color="error.dark">
              Student&apos;s Dispute Reason
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {request.disputeReason || 'No reason provided'}
            </Typography>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Resolution Actions
            </Typography>
            <Box component="ul" sx={{ pl: 2, mt: 1, mb: 0 }}>
              <li><strong>Refund:</strong> Issue a new payment to the student</li>
              <li><strong>Confirm:</strong> Confirm payment was received, close dispute</li>
              <li><strong>Investigate:</strong> Flag for deeper investigation</li>
            </Box>
          </Alert>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="action-label">Resolution Action</InputLabel>
            <Select
              labelId="action-label"
              value={action}
              label="Resolution Action"
              onChange={handleActionChange}
              required
            >
              <MenuItem value="investigate">
                <Chip size="small" color="warning" label="Flag for Investigation" sx={{ mr: 1 }} />
                Requires further investigation
              </MenuItem>
              <MenuItem value="refund">
                <Chip size="small" color="error" label="Issue Refund" sx={{ mr: 1 }} />
                Re-issue payment to student
              </MenuItem>
              <MenuItem value="confirm">
                <Chip size="small" color="success" label="Confirm Payment" sx={{ mr: 1 }} />
                Payment was received by student
              </MenuItem>
            </Select>
          </FormControl>

          <TextField
            multiline
            rows={4}
            fullWidth
            label="Resolution Details"
            placeholder="Provide detailed explanation of your decision and any actions taken..."
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            error={resolution.length > 0 && resolution.length < 10}
            helperText={
              resolution.length > 0 && resolution.length < 10
                ? 'Resolution must be at least 10 characters'
                : `${resolution.length}/1000 characters`
            }
            inputProps={{ maxLength: 1000 }}
            required
          />

          {mutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to resolve dispute'}
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
            color="primary"
            disabled={resolution.trim().length < 10 || mutation.isPending}
          >
            {mutation.isPending ? 'Resolving...' : 'Resolve Dispute'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

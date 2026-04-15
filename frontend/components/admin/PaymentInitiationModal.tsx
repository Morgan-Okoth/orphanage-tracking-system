'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Stack,
  Box,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { paymentsApi, InitiatePaymentResponse } from '../../lib/api/payments';
import { ApiResponse } from '../../lib/types/api';

const phoneSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, 'Phone number is required')
    .regex(
      /^(\+2547\d{8}|\+2541\d{8}|07\d{8}|01\d{8})$/,
      'Enter a valid Kenyan phone number (e.g. +254712345678, 0712345678)',
    ),
});

type PhoneFormValues = z.infer<typeof phoneSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  requestId: string;
  amount: number;
  studentName: string;
  onSuccess?: () => void;
}

export default function PaymentInitiationModal({
  open,
  onClose,
  requestId,
  amount,
  studentName,
  onSuccess,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneSchema),
  });

  const mutation = useMutation<
    ApiResponse<InitiatePaymentResponse>,
    Error,
    PhoneFormValues
  >({
    mutationFn: ({ phoneNumber }) =>
      paymentsApi.initiatePayment(requestId, phoneNumber, amount),
  });

  const handleClose = () => {
    mutation.reset();
    reset();
    onClose();
  };

  const onSubmit = (values: PhoneFormValues) => {
    mutation.mutate(values, {
      onSuccess: () => {
        onSuccess?.();
      },
    });
  };

  const paymentData = mutation.data?.data;
  const isSuccess = mutation.isSuccess && !!paymentData;

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Initiate IntaSend Payout</DialogTitle>

      <DialogContent>
        {/* Request summary */}
        <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 2, mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Student
          </Typography>
          <Typography variant="body1" fontWeight={600}>
            {studentName}
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Amount
          </Typography>
          <Typography variant="h6" color="primary" fontWeight={700}>
            KES {amount.toLocaleString()}
          </Typography>
        </Box>

        {/* Success state */}
        {isSuccess && (
          <Stack spacing={1.5} alignItems="center" py={2}>
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48 }} />
            <Typography variant="h6" color="success.main">
              Payment Initiated
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              The IntaSend payout request has been created for the registered phone number.
            </Typography>
            <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 2, width: '100%' }}>
              <Typography variant="caption" color="text.secondary">
                Transaction ID
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {paymentData.transactionId}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                IntaSend Tracking ID
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {paymentData.intasendTrackingId}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Status
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ textTransform: 'capitalize' }}>
                {paymentData.status}
              </Typography>
            </Box>
          </Stack>
        )}

        {/* Form state */}
        {!isSuccess && (
          <form id="payment-form" onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing={2}>
              {mutation.isError && (
                <Alert severity="error">
                  {mutation.error?.message ?? 'Payout initiation failed. Please try again.'}
                </Alert>
              )}

              <TextField
                label="Recipient Phone Number"
                placeholder="+254712345678 or 0712345678"
                fullWidth
                disabled={mutation.isPending}
                error={!!errors.phoneNumber}
                helperText={
                  errors.phoneNumber?.message ??
                  'Enter the payout recipient phone number'
                }
                {...register('phoneNumber')}
              />

              {mutation.isPending && (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="text.secondary">
                    Sending payout request...
                  </Typography>
                </Stack>
              )}
            </Stack>
          </form>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={mutation.isPending}>
          {isSuccess ? 'Close' : 'Cancel'}
        </Button>
        {!isSuccess && (
          <Button
            type="submit"
            form="payment-form"
            variant="contained"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Processing...' : 'Initiate Payout'}
          </Button>
        )}
        {mutation.isError && (
          <Button
            variant="contained"
            onClick={() => mutation.reset()}
          >
            Retry
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

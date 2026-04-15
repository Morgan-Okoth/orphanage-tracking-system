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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PaymentsIcon from '@mui/icons-material/Payments';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { format } from 'date-fns';
import { adminApi } from '../../../../../lib/api/admin';
import { paymentsApi } from '../../../../../lib/api/payments';
import { RequestStatus } from '../../../../../lib/types/request';
import { UserRole } from '../../../../../lib/types/user';
import { useAuth } from '../../../../../lib/contexts/AuthContext';
import RequestStatusBadge from '../../../../../components/requests/RequestStatusBadge';
import RequestReview from '../../../../../components/requests/RequestReview';
import CommentThread from '../../../../../components/requests/CommentThread';
import DocumentViewer from '../../../../../components/documents/DocumentViewer';
import RequestTimeline from '../../../../../components/requests/RequestTimeline';
import LoadingSpinner from '../../../../../components/common/LoadingSpinner';
import PaymentInitiationModal from '../../../../../components/admin/PaymentInitiationModal';

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

export default function AdminRequestDetailPage({ params }: Props) {
  const { id } = use(params);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-request', id],
    queryFn: () => adminApi.getRequest(id),
  });

  const { data: paymentData } = useQuery({
    queryKey: ['payment-by-request', id],
    queryFn: () => paymentsApi.getPaymentByRequest(id),
    enabled: data?.data?.status === RequestStatus.PAID,
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data)
    return <Alert severity="error">Request not found.</Alert>;

  const req = data.data;
  const isAdminLevel1 = user?.role === UserRole.ADMIN_LEVEL_1;
  const payment = paymentData?.data;

  return (
    <Box maxWidth={900} mx="auto">
      <Button
        component={Link}
        href="/admin/requests"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
      >
        Back to Requests
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

            {/* Payment initiation */}
            {isAdminLevel1 && req.status === RequestStatus.VERIFIED && (
              <Box mt={2}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<PaymentsIcon />}
                  onClick={() => setPaymentModalOpen(true)}
                >
                  Initiate Payment
                </Button>
              </Box>
            )}

            {/* Payment details when PAID */}
            {req.status === RequestStatus.PAID && payment && (
              <Box mt={2}>
                <Alert severity="success" icon={<PaymentsIcon />}>
                  <Typography variant="subtitle2" gutterBottom>
                    Payment Completed
                  </Typography>
                  <Stack spacing={0.5}>
                    {payment.mpesaTransactionId && (
                      <Typography variant="body2">
                        <strong>Transaction ID:</strong> {payment.mpesaTransactionId}
                      </Typography>
                    )}
                    {payment.mpesaReceiptNumber && (
                      <Typography variant="body2">
                        <strong>Receipt:</strong> {payment.mpesaReceiptNumber}
                      </Typography>
                    )}
                    <Typography variant="body2">
                      <strong>Amount:</strong> KES {payment.amount.toLocaleString()}
                    </Typography>
                    {payment.completedAt && (
                      <Typography variant="body2">
                        <strong>Date:</strong>{' '}
                        {format(new Date(payment.completedAt), 'MMM d, yyyy HH:mm')}
                      </Typography>
                    )}
                  </Stack>
                </Alert>
              </Box>
            )}
          </Paper>

          {/* Documents */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Documents
            </Typography>
            <DocumentViewer requestId={id} />
          </Paper>

          {/* Review actions */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Review Actions
            </Typography>
            <RequestReview requestId={id} currentStatus={req.status as RequestStatus} />
          </Paper>

          {/* Comments */}
          <Paper sx={{ p: 3 }}>
            <CommentThread requestId={id} />
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

      {/* Payment initiation modal */}
      <PaymentInitiationModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        requestId={id}
        amount={req.amount}
        studentName={req.studentName ?? 'Unknown Student'}
        onSuccess={() => {
          setPaymentModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ['admin-request', id] });
          queryClient.invalidateQueries({ queryKey: ['payment-by-request', id] });
        }}
      />
    </Box>
  );
}

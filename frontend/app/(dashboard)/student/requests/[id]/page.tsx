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
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WarningIcon from '@mui/icons-material/Warning';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { requestsApi } from '../../../../../lib/api/requests';
import { documentsApi } from '../../../../../lib/api/documents';
import { RequestStatus } from '../../../../../lib/types/request';
import RequestStatusBadge from '../../../../../components/requests/RequestStatusBadge';
import DisputeForm from '../../../../../components/requests/DisputeForm';
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

export default function RequestDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [disputeOpen, setDisputeOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-request', id],
    queryFn: () => requestsApi.getById(id),
  });

  const { data: docsData } = useQuery({
    queryKey: ['request-docs', id],
    queryFn: () => documentsApi.list(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data)
    return <Alert severity="error">Request not found.</Alert>;

  const req = data.data;
  const docs = docsData?.data ?? [];

  const timeline = [
    { label: 'Submitted', date: req.submittedAt },
    req.reviewedAt ? { label: 'Reviewed', date: req.reviewedAt } : null,
    req.verifiedAt ? { label: 'Verified', date: req.verifiedAt } : null,
    req.paidAt ? { label: 'Paid', date: req.paidAt } : null,
  ].filter(Boolean) as { label: string; date: Date }[];

  return (
    <Box maxWidth={720} mx="auto">
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.back()}
        sx={{ mb: 2 }}
      >
        Back
      </Button>

      <Paper sx={{ p: 4 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              {typeLabels[req.type] ?? req.type}
            </Typography>
            <Typography variant="h6" color="primary" mt={0.5}>
              KES {req.amount.toLocaleString()}
            </Typography>
          </Box>
          <RequestStatusBadge status={req.status} size="medium" />
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>Reason</Typography>
        <Typography variant="body1" mb={3}>{req.reason}</Typography>

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
        {req.disputeReason && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Dispute reason:</strong> {req.disputeReason}
            {req.disputeResolution && (
              <Box sx={{ mt: 1 }}>
                <strong>Resolution:</strong> {req.disputeResolution}
              </Box>
            )}
          </Alert>
        )}

        <Typography variant="subtitle2" gutterBottom>Timeline</Typography>
        <List dense disablePadding sx={{ mb: 3 }}>
          {timeline.map(({ label, date }) => (
            <ListItem key={label} disableGutters>
              <ListItemText
                primary={label}
                secondary={(() => {
                  try {
                    if (!date) return 'N/A';
                    const d = new Date(date);
                    if (isNaN(d.getTime())) return 'Invalid date';
                    return format(d, 'MMM d, yyyy HH:mm');
                  } catch {
                    return 'Invalid date';
                  }
                })()}
              />
            </ListItem>
          ))}
        </List>

        {docs.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>Documents</Typography>
            <List dense disablePadding>
              {docs.map((doc) => (
                <ListItem key={doc.id} disableGutters>
                  <ListItemText
                    primary={doc.fileName}
                    secondary={`${(doc.fileSize / 1024).toFixed(1)} KB — ${doc.scanStatus}`}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}

        {/* Dispute Button - Only show for PAID requests */}
        {req.status === RequestStatus.PAID && (
          <>
            <Divider sx={{ my: 2 }} />
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                If you have not received the payment, you can raise a dispute. 
                This will be reviewed by administrators.
              </Typography>
            </Alert>
            <Button
              variant="outlined"
              color="error"
              startIcon={<WarningIcon />}
              onClick={() => setDisputeOpen(true)}
              fullWidth
            >
              Raise Payment Dispute
            </Button>
          </>
        )}
      </Paper>

      <DisputeForm
        requestId={id}
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
      />
    </Box>
  );
}

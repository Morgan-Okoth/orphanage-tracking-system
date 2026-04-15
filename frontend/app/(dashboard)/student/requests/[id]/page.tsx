'use client';

import { use } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { requestsApi } from '../../../../../lib/api/requests';
import { documentsApi } from '../../../../../lib/api/documents';
import RequestStatusBadge from '../../../../../components/requests/RequestStatusBadge';
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['request', id],
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
              ${req.amount.toLocaleString()}
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

        <Typography variant="subtitle2" gutterBottom>Timeline</Typography>
        <List dense disablePadding sx={{ mb: 3 }}>
          {timeline.map(({ label, date }) => (
            <ListItem key={label} disableGutters>
              <ListItemText
                primary={label}
                secondary={format(new Date(date), 'MMM d, yyyy HH:mm')}
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
      </Paper>
    </Box>
  );
}

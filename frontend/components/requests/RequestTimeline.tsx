'use client';

import {
  Box,
  Typography,
  Stack,
  CircularProgress,
  Alert,
} from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { adminApi, StatusChange } from '../../lib/api/admin';
import RequestStatusBadge from './RequestStatusBadge';
import { RequestStatus } from '../../lib/types/request';

interface Props {
  requestId: string;
}

function TimelineEntry({ entry, isLast }: { entry: StatusChange; isLast: boolean }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      {/* Vertical line + dot */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.5 }}>
        <FiberManualRecordIcon sx={{ fontSize: 12, color: 'primary.main' }} />
        {!isLast && (
          <Box sx={{ width: 2, flex: 1, minHeight: 24, bgcolor: 'divider', mt: 0.5 }} />
        )}
      </Box>

      <Box pb={isLast ? 0 : 2}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <RequestStatusBadge status={entry.toStatus as RequestStatus} size="small" />
          <Typography variant="caption" color="text.secondary">
            by {entry.changedByName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            · {(() => {
              try {
                if (!entry.changedAt) return 'N/A';
                const date = new Date(entry.changedAt);
                if (isNaN(date.getTime())) return 'Invalid date';
                return format(date, 'MMM d, yyyy HH:mm');
              } catch {
                return 'Invalid date';
              }
            })()}
          </Typography>
        </Stack>
        {entry.reason && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {entry.reason}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

export default function RequestTimeline({ requestId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['request-history', requestId],
    queryFn: () => adminApi.getRequestHistory(requestId),
  });

  const history = Array.isArray(data?.data) ? data.data : [];

  if (isLoading) return <CircularProgress size={20} />;
  if (isError) return <Alert severity="error">Failed to load history.</Alert>;
  if (history.length === 0)
    return (
      <Typography variant="body2" color="text.secondary">
        No history available.
      </Typography>
    );

  return (
    <Box>
      {history.map((entry, i) => (
        <TimelineEntry key={entry.id} entry={entry} isLast={i === history.length - 1} />
      ))}
    </Box>
  );
}

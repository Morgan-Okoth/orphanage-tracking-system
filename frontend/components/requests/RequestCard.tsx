import { Card, CardContent, CardActionArea, Typography, Box, Stack } from '@mui/material';
import { format } from 'date-fns';
import { Request } from '../../lib/types/request';
import RequestStatusBadge from './RequestStatusBadge';

interface Props {
  request: Request;
  onClick?: () => void;
}

const typeLabels: Record<string, string> = {
  SCHOOL_FEES: 'School Fees',
  MEDICAL_EXPENSES: 'Medical Expenses',
  SUPPLIES: 'Supplies',
  EMERGENCY: 'Emergency',
  OTHER: 'Other',
};

export default function RequestCard({ request, onClick }: Props) {
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onClick}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {typeLabels[request.type] ?? request.type}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {request.reason.length > 80
                  ? `${request.reason.slice(0, 80)}…`
                  : request.reason}
              </Typography>
            </Box>
            <Box textAlign="right" ml={2}>
              <Typography variant="h6" color="primary">
                ${request.amount.toLocaleString()}
              </Typography>
              <RequestStatusBadge status={request.status} />
            </Box>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Submitted {format(new Date(request.submittedAt), 'MMM d, yyyy')}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

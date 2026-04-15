import { Box, Paper } from '@mui/material';
import RequestForm from '../../../../../components/requests/RequestForm';

export default function NewRequestPage() {
  return (
    <Box maxWidth={640} mx="auto">
      <Paper sx={{ p: 4 }}>
        <RequestForm />
      </Paper>
    </Box>
  );
}

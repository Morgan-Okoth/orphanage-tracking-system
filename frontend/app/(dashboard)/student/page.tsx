import { Box, Button, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import Link from 'next/link';
import RequestList from '../../../components/requests/RequestList';

export default function StudentDashboard() {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700}>
          My Requests
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          component={Link}
          href="/student/requests/new"
        >
          New Request
        </Button>
      </Stack>
      <RequestList />
    </Box>
  );
}

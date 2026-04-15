'use client';

import { Box, Container, Typography, Button, Divider, Paper } from '@mui/material';
import { Home as HomeIcon, BarChart as BarChartIcon } from '@mui/icons-material';
import Link from 'next/link';
import PublicDashboard from '../../components/transparency/PublicDashboard';

export default function PublicTransparencyPage() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%)',
          color: 'white',
          py: { xs: 5, md: 8 },
          px: 2,
        }}
      >
        <Container maxWidth="lg">
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <BarChartIcon sx={{ fontSize: { xs: 36, md: 48 } }} />
            <Typography
              variant="h3"
              component="h1"
              fontWeight={700}
              sx={{ fontSize: { xs: '1.75rem', sm: '2.25rem', md: '3rem' } }}
            >
              Financial Transparency Dashboard
            </Typography>
          </Box>
          <Typography
            variant="h6"
            sx={{ opacity: 0.9, maxWidth: 680, fontSize: { xs: '1rem', md: '1.25rem' } }}
          >
            Bethel Rays of Hope NGO is committed to full financial transparency. Track how
            donations are received and disbursed to support our beneficiaries.
          </Typography>
          <Button
            component={Link}
            href="/"
            variant="outlined"
            startIcon={<HomeIcon />}
            sx={{
              mt: 3,
              color: 'white',
              borderColor: 'rgba(255,255,255,0.6)',
              '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
            }}
          >
            Back to Home
          </Button>
        </Container>
      </Box>

      {/* Main Content */}
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <PublicDashboard />
      </Container>

      {/* Footer Note */}
      <Divider />
      <Box sx={{ bgcolor: 'background.paper', py: 3 }}>
        <Container maxWidth="lg">
          <Paper
            elevation={0}
            sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2, textAlign: 'center' }}
          >
            <Typography variant="body2" color="text.secondary">
              Data updated daily. All beneficiary information is anonymized to protect privacy.
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              © {new Date().getFullYear()} Bethel Rays of Hope NGO. All rights reserved.
            </Typography>
          </Paper>
        </Container>
      </Box>
    </Box>
  );
}

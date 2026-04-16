'use client';

import Link from 'next/link';
import { Home as HomeIcon, VolunteerActivism as VolunteerActivismIcon } from '@mui/icons-material';
import { Box, Button, Container, Divider, Paper, Stack, Typography } from '@mui/material';

const donationUrl = process.env.NEXT_PUBLIC_DONATION_URL;

const supportItems = [
  {
    title: 'Care support',
    description: 'Contribute to immediate needs such as meals, essentials, and welfare support.',
  },
  {
    title: 'Education support',
    description: 'Help children access school requirements and learning opportunities.',
  },
  {
    title: 'Sustained impact',
    description: 'Join supporters building long-term change through consistent giving and advocacy.',
  },
];

export default function DonatePage() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%)',
          color: 'common.white',
          py: { xs: 5, md: 8 },
          px: 2,
        }}
      >
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" spacing={2} mb={2}>
            <VolunteerActivismIcon sx={{ fontSize: { xs: 36, md: 48 } }} />
            <Typography variant="h3" component="h1" fontWeight={700} sx={{ fontSize: { xs: '1.75rem', sm: '2.25rem', md: '3rem' } }}>
              Support Bethel Rays of Hope
            </Typography>
          </Stack>
          <Typography variant="h6" sx={{ opacity: 0.9, maxWidth: 700, fontSize: { xs: '1rem', md: '1.25rem' } }}>
            Give hope to children and families through care programs, education support, and
            community-led impact.
          </Typography>
          <Button
            component={Link}
            href="/"
            variant="outlined"
            startIcon={<HomeIcon />}
            sx={{
              mt: 3,
              color: 'common.white',
              borderColor: 'rgba(255,255,255,0.6)',
              '&:hover': { borderColor: 'common.white', bgcolor: 'rgba(255,255,255,0.1)' },
            }}
          >
            Back to Home
          </Button>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 2, border: 1, borderColor: 'divider' }}>
          <Stack spacing={2.5}>
            {supportItems.map((item) => (
              <Box key={item.title}>
                <Typography variant="h6" mb={0.5}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.description}
                </Typography>
              </Box>
            ))}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} pt={1}>
              <Button
                component="a"
                href={donationUrl || 'mailto:info@bethelraysofhope.org?subject=Donation%20Support'}
                variant="contained"
              >
                {donationUrl ? 'Donate Securely' : 'Request Donation Link'}
              </Button>
              <Button component={Link} href="/public-transparency" variant="outlined">
                View Public Updates
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Container>

      <Divider />
      <Box sx={{ bgcolor: 'background.paper', py: 3 }}>
        <Container maxWidth="lg">
          <Paper elevation={0} sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              We are committed to responsible stewardship and dignified support for every child and family we serve.
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

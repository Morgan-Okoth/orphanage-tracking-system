'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import {
  landingFeatures,
  landingMetrics,
  organizationHighlights,
  supportHighlights,
} from './landingConfig';

function HeroSection() {
  return (
    <Box
      sx={{
        px: { xs: 0, md: 0 },
        py: { xs: 3, md: 5 },
        color: 'common.white',
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center" mb={2}>
        <Image
          src="/logo.png"
          alt="Bethel Rays of Hope Logo"
          width={200}
          height={200}
          style={{ borderRadius: '50%', objectFit: 'cover' }}
        />
        <Chip
          label="Bethel Rays of Hope - Kisumu, Kenya"
          sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'common.white', fontWeight: 600 }}
        />
      </Stack>
      <Typography variant="h2" sx={{ maxWidth: '16ch', mb: 2 }}>
        Hope, care, and dignity for every child we serve.
      </Typography>
      <Typography variant="body1" sx={{ maxWidth: '65ch', opacity: 0.92 }}>
        Bethel Rays of Hope is dedicated to supporting vulnerable children and families through
        compassionate programs, trusted stewardship, and a strong community of supporters.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mt={3.5}>
        <Button
          component={Link}
          href="/public-transparency"
          variant="contained"
          endIcon={<ArrowForwardIcon />}
          sx={{ fontWeight: 600, bgcolor: 'common.white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' } }}
        >
          View Public Updates
        </Button>
        <Button
          component={Link}
          href="/donate"
          variant="outlined"
          sx={{
            fontWeight: 600,
            color: 'common.white',
            borderColor: 'rgba(255,255,255,0.75)',
            '&:hover': { borderColor: 'common.white', bgcolor: 'rgba(255,255,255,0.12)' },
          }}
        >
          Support Our Mission
        </Button>
      </Stack>
    </Box>
  );
}

export default function LandingPage() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%)',
          color: 'common.white',
          px: 2,
          pr: 0,
          pt: 1,
          pb: { xs: 3, md: 4 },
        }}
      >
        <Container maxWidth="lg">
          <AppBar position="static" color="transparent" elevation={0}>
            <Toolbar disableGutters sx={{ py: 0.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" flexGrow={1}>
                <Image
                  src="/logo.png"
                  alt="Bethel Rays of Hope Logo"
                  width={40}
                  height={40}
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                />
                <Typography variant="subtitle1" fontWeight={700} color="inherit">
                  Bethel Rays of Hope
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button component={Link} href="/login" sx={{ color: 'common.white' }}>
                  Sign in
                </Button>
              </Stack>
            </Toolbar>
          </AppBar>
          <HeroSection />
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
        <Stack spacing={7}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 3, md: 2 }}
            divider={<Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />}
          >
            {landingMetrics.map((metric) => (
              <Box key={metric.label} sx={{ flex: 1 }}>
                <Typography variant="h4" color="primary.main" fontWeight={700}>
                  {metric.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {metric.label}
                </Typography>
              </Box>
            ))}
          </Stack>

          <Box>
            <Typography variant="h4" mb={2}>
              Our focus
            </Typography>
            <Stack spacing={2.5}>
              {landingFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Stack key={feature.title} direction="row" spacing={1.5} alignItems="flex-start">
                    <Icon color="primary" />
                    <Box>
                      <Typography variant="h6" mb={0.5}>
                        {feature.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {feature.description}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="h4" mb={2}>
              About the organization
            </Typography>
            <Stack spacing={2.5}>
              {organizationHighlights.map((highlight) => (
                <Box key={highlight.title}>
                  <Typography variant="h6" mb={0.5}>
                    {highlight.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {highlight.description}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="h4" mb={2}>
              Ways to support
            </Typography>
            <Stack spacing={2.5}>
              {supportHighlights.map((highlight) => {
                const Icon = highlight.icon;
                return (
                  <Stack key={highlight.title} direction="row" spacing={1.5} alignItems="flex-start">
                    <Icon color="primary" />
                    <Box>
                      <Typography variant="h6" mb={0.5}>
                        {highlight.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {highlight.description}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Box>
        </Stack>
      </Container>

      <Divider />
      <Box sx={{ bgcolor: 'background.paper', py: 3 }}>
        <Container maxWidth="lg">
          <Paper elevation={0} sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              We serve children and families through care, education support, and community partnership.
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

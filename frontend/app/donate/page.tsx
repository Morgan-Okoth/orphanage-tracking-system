'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Home as HomeIcon, VolunteerActivism as VolunteerActivismIcon, Payment as PaymentIcon } from '@mui/icons-material';
import {
  Box,
  Button,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
  TextField,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';

const PRESET_AMOUNTS = [100, 500, 1000, 2500, 5000];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://financial-transparency-api.morgan-ent.workers.dev';

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
  const [amount, setAmount] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handlePresetAmount = (preset: number) => {
    setAmount(String(preset));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount < 10) {
      setError('Minimum donation amount is KES 10');
      return;
    }

    if (numericAmount > 1000000) {
      setError('Maximum donation amount is KES 1,000,000');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/donations/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numericAmount,
          donorName: donorName.trim() || undefined,
          donorEmail: donorEmail.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to initiate donation');
      }

      // Redirect to IntaSend checkout URL
      const checkoutUrl = data.data?.checkoutUrl;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

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
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          {/* Donation Form */}
          <Paper elevation={0} sx={{ flex: 1, p: { xs: 2.5, md: 3.5 }, borderRadius: 2, border: 1, borderColor: 'divider' }}>
            <Typography variant="h5" fontWeight={700} mb={3}>
              Make a Donation
            </Typography>

            <form onSubmit={handleSubmit}>
              <Stack spacing={2.5}>
                {/* Preset amounts */}
                <Box>
                  <Typography variant="body2" color="text.secondary" mb={1}>
                    Quick amounts
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {PRESET_AMOUNTS.map((preset) => (
                      <Chip
                        key={preset}
                        label={`KES ${preset.toLocaleString()}`}
                        onClick={() => handlePresetAmount(preset)}
                        clickable
                        variant={String(preset) === amount ? 'filled' : 'outlined'}
                        color={String(preset) === amount ? 'primary' : 'default'}
                      />
                    ))}
                  </Stack>
                </Box>

                {/* Custom amount */}
                <TextField
                  label="Amount (KES)"
                  type="number"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError('');
                  }}
                  fullWidth
                  required
                />

                <TextField
                  label="Your Name (optional)"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  fullWidth
                />

                <TextField
                  label="Email (optional)"
                  type="email"
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(e.target.value)}
                  fullWidth
                />

                {error && <Alert severity="error">{error}</Alert>}

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  startIcon={isSubmitting ? <CircularProgress size={20} /> : <PaymentIcon />}
                  disabled={isSubmitting || !amount}
                  fullWidth
                >
                  {isSubmitting ? 'Redirecting to payment...' : 'Donate Now'}
                </Button>
              </Stack>
            </form>
          </Paper>

          {/* Info Section */}
          <Paper elevation={0} sx={{ flex: 1, p: { xs: 2.5, md: 3.5 }, borderRadius: 2, border: 1, borderColor: 'divider' }}>
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
              <Box sx={{ mt: 1, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="body2" color="text.secondary">
                  Secure payments powered by IntaSend. Pay with M-Pesa, Visa, or Mastercard.
                </Typography>
              </Box>
            </Stack>
            <Button
              component={Link}
              href="/public-transparency"
              variant="outlined"
              fullWidth
              sx={{ mt: 2 }}
            >
              View Public Updates
            </Button>
          </Paper>
        </Stack>
      </Container>

      <Divider />
      <Box sx={{ bgcolor: 'background.paper', py: 3 }}>
        <Container maxWidth="lg">
          <Paper elevation={0} sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              We are committed to responsible stewardship and dignified support for every child and family we serve.
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              &copy; {new Date().getFullYear()} Bethel Rays of Hope NGO. All rights reserved.
            </Typography>
          </Paper>
        </Container>
      </Box>
    </Box>
  );
}

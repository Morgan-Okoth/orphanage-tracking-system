'use client';

import { useState, useEffect, useRef } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

declare global {
  interface Window {
    IntaSend: {
      Inline: new (options: {
        publicAPIKey: string;
        callbackURL: string;
        live: boolean;
      }) => {
        on: (event: string, handler: (data: any) => void) => void;
        collect: (options: {
          amount: number;
          currency: string;
          email?: string;
          first_name?: string;
          last_name?: string;
          narrative?: string;
        }) => void;
      };
    };
  }
}

const PRESET_AMOUNTS = [100, 500, 1000, 2500, 5000];

const INTASEND_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_INTASEND_PUBLISHABLE_KEY || '';

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
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ success: boolean; message: string } | null>(null);
  const intaSendRef = useRef<any>(null);

  // Load IntaSend Inline SDK
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.IntaSend?.Inline) {
      setSdkLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sandbox.intasend.net/intsnd-collect/v1.0/intsnd-collect.js';
    script.async = true;
    script.onload = () => setSdkLoaded(true);
    script.onerror = () => {
      // Fallback to production CDN
      const fallbackScript = document.createElement('script');
      fallbackScript.src = 'https://collection.intasend.com/intsnd-collect/v1.0/intsnd-collect.js';
      fallbackScript.async = true;
      fallbackScript.onload = () => setSdkLoaded(true);
      document.head.appendChild(fallbackScript);
    };
    document.head.appendChild(script);
  }, []);

  // Initialize IntaSend when SDK is loaded
  useEffect(() => {
    if (!sdkLoaded || typeof window === 'undefined' || !window.IntaSend?.Inline) return;

    const isLive = process.env.NEXT_PUBLIC_INTASEND_ENV === 'live';

    intaSendRef.current = new window.IntaSend.Inline({
      publicAPIKey: INTASEND_PUBLISHABLE_KEY,
      callbackURL: `${window.location.origin}/donate`,
      live: isLive,
    });

    intaSendRef.current.on('COMPLETE', (response: any) => {
      setIsSubmitting(false);
      setPaymentResult({
        success: true,
        message: `Payment successful! Reference: ${response?.reference || 'Thank you for your donation!'}`,
      });
    });

    intaSendRef.current.on('FAILED', (response: any) => {
      setIsSubmitting(false);
      setPaymentResult({
        success: false,
        message: response?.reason || 'Payment failed. Please try again.',
      });
    });

    setSdkReady(true);
  }, [sdkLoaded]);

  const handlePresetAmount = (preset: number) => {
    setAmount(String(preset));
    setPaymentResult(null);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPaymentResult(null);

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount < 10) {
      setError('Minimum donation amount is KES 10');
      return;
    }

    if (numericAmount > 1000000) {
      setError('Maximum donation amount is KES 1,000,000');
      return;
    }

    if (!sdkReady || !intaSendRef.current) {
      setError('Payment system is loading. Please wait a moment and try again.');
      return;
    }

    if (!INTASEND_PUBLISHABLE_KEY) {
      setError('Payment gateway is not configured. Please contact support.');
      return;
    }

    setIsSubmitting(true);

    const nameParts = donorName.trim().split(' ');

    intaSendRef.current.collect({
      amount: numericAmount,
      currency: 'KES',
      email: donorEmail.trim() || undefined,
      first_name: nameParts[0] || 'Supporter',
      last_name: nameParts.slice(1).join(' ') || '',
      narrative: 'Donation to Bethel Rays of Hope',
    });
  };

  const handleCloseDialog = () => {
    setPaymentResult(null);
    if (paymentResult?.success) {
      setAmount('');
      setDonorName('');
      setDonorEmail('');
    }
  };

  if (!sdkLoaded) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            Loading payment system...
          </Typography>
        </Stack>
      </Box>
    );
  }

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
                    setPaymentResult(null);
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
                  disabled={isSubmitting || !amount || !sdkReady}
                  fullWidth
                >
                  {isSubmitting ? 'Processing...' : !sdkReady ? 'Loading...' : 'Donate Now'}
                </Button>

                {!INTASEND_PUBLISHABLE_KEY && (
                  <Alert severity="warning">
                    Payment gateway not configured. Donations will not work in this environment.
                  </Alert>
                )}
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

      {/* Payment Result Dialog */}
      <Dialog open={!!paymentResult} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {paymentResult?.success ? 'Donation Successful' : 'Payment Failed'}
          <IconButton onClick={handleCloseDialog} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            {paymentResult?.success ? (
              <CheckCircleIcon color="success" sx={{ fontSize: 48 }} />
            ) : (
              <ErrorIcon color="error" sx={{ fontSize: 48 }} />
            )}
            <Typography variant="body1">
              {paymentResult?.message}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} variant="contained">
            {paymentResult?.success ? 'Thank You!' : 'Try Again'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

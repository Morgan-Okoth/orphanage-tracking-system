'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, Typography, Box } from '@mui/material';
import LoginForm from '../../../components/auth/LoginForm';

export default function LoginPage() {
  const router = useRouter();

  return (
    <Card>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Sign In
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
          Financial Transparency System
        </Typography>
        <LoginForm onSuccess={() => router.push('/')} />
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="body2">
            Don&apos;t have an account?{' '}
            <Link href="/register" style={{ color: 'inherit' }}>
              Register here
            </Link>
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

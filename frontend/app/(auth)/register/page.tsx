'use client';

import Link from 'next/link';
import { Card, CardContent, Typography, Box } from '@mui/material';
import RegisterForm from '../../../components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <Card>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Create Account
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
          Financial Transparency System
        </Typography>
        <RegisterForm />
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="body2">
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'inherit' }}>
              Sign in
            </Link>
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

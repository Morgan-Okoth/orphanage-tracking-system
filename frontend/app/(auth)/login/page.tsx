'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, Typography } from '@mui/material';
import LoginForm from '../../../components/auth/LoginForm';
import { UserRole } from '../../../lib/types/user';
import { getDashboardRoute } from '../../../lib/utils/roleRoutes';

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
        <LoginForm onSuccess={(role) => router.push(getDashboardRoute(role as UserRole))} />
      </CardContent>
    </Card>
  );
}

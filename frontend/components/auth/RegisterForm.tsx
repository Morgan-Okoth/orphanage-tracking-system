'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useState } from 'react';
import { authApi } from '../../lib/api/auth';
import { ApiError } from '../../lib/api/client';

function normalizeKenyanPhone(phone: string): string {
  const trimmed = phone.replace(/\s+/g, '');
  if (trimmed.startsWith('+254')) return trimmed;
  if (trimmed.startsWith('254')) return `+${trimmed}`;
  if (trimmed.startsWith('0') && trimmed.length === 10) {
    return `+254${trimmed.slice(1)}`;
  }
  return trimmed;
}

const schema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(7, 'Phone number is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

interface RegisterFormProps {
  onSuccess?: () => void;
}

export default function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const { confirmPassword: _, ...payload } = values;
      await authApi.register({
        ...payload,
        phone: normalizeKenyanPhone(payload.phone),
      });
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Registration failed. Please try again.',
      );
    }
  };

  if (success) {
    return (
      <Alert severity="success">
        Registration submitted. Your account is pending approval by an administrator.
      </Alert>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ mt: 1 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          label="First Name"
          fullWidth
          {...register('firstName')}
          error={!!errors.firstName}
          helperText={errors.firstName?.message}
        />
        <TextField
          label="Last Name"
          fullWidth
          {...register('lastName')}
          error={!!errors.lastName}
          helperText={errors.lastName?.message}
        />
      </Box>
      <TextField
        label="Email"
        type="email"
        fullWidth
        margin="normal"
        {...register('email')}
        error={!!errors.email}
        helperText={errors.email?.message}
      />
      <TextField
        label="Phone Number"
        fullWidth
        margin="normal"
        {...register('phone')}
        error={!!errors.phone}
        helperText={errors.phone?.message}
      />
      <TextField
        label="Password"
        type="password"
        fullWidth
        margin="normal"
        {...register('password')}
        error={!!errors.password}
        helperText={errors.password?.message}
      />
      <TextField
        label="Confirm Password"
        type="password"
        fullWidth
        margin="normal"
        {...register('confirmPassword')}
        error={!!errors.confirmPassword}
        helperText={errors.confirmPassword?.message}
      />
      <Button
        type="submit"
        fullWidth
        variant="contained"
        size="large"
        disabled={isSubmitting}
        sx={{ mt: 3 }}
      >
      {isSubmitting ? <CircularProgress size={24} /> : 'Create Account'}
      </Button>
      <Alert severity="info" sx={{ mt: 2 }}>
        Public registration is for beneficiaries. Staff and auditor accounts are created internally.
      </Alert>
    </Box>
  );
}

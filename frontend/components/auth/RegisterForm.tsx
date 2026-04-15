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
  MenuItem,
} from '@mui/material';
import { useState } from 'react';
import { authApi } from '../../lib/api/auth';
import { UserRole } from '../../lib/types/user';
import { ApiError } from '../../lib/api/client';

const schema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(7, 'Phone number is required'),
    role: z.nativeEnum(UserRole),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

const ROLE_OPTIONS = [
  { value: UserRole.STUDENT, label: 'Student / Beneficiary' },
  { value: UserRole.ADMIN_LEVEL_1, label: 'Admin Level 1 (Operations)' },
  { value: UserRole.ADMIN_LEVEL_2, label: 'Admin Level 2 (Auditor)' },
];

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
    defaultValues: { role: UserRole.STUDENT },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const { confirmPassword: _, ...payload } = values;
      await authApi.register(payload);
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
        select
        label="Role"
        fullWidth
        margin="normal"
        defaultValue={UserRole.STUDENT}
        inputProps={register('role')}
        error={!!errors.role}
        helperText={errors.role?.message}
      >
        {ROLE_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>
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
    </Box>
  );
}

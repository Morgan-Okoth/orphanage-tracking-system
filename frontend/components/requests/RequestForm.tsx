'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { requestsApi } from '../../lib/api/requests';
import { documentsApi } from '../../lib/api/documents';
import { RequestType } from '../../lib/types/request';
import DocumentUpload from '../documents/DocumentUpload';

const schema = z.object({
  type: z.nativeEnum(RequestType),
  amount: z.coerce.number().positive('Amount must be positive'),
  reason: z.string().min(10, 'Please provide at least 10 characters'),
});

type FormValues = z.infer<typeof schema>;

interface UploadedFile { file: File; id: string; }

const typeOptions = [
  { value: RequestType.SCHOOL_FEES, label: 'School Fees' },
  { value: RequestType.MEDICAL_EXPENSES, label: 'Medical Expenses' },
  { value: RequestType.SUPPLIES, label: 'Supplies' },
  { value: RequestType.EMERGENCY, label: 'Emergency' },
  { value: RequestType.OTHER, label: 'Other' },
];

export default function RequestForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await requestsApi.create(values);
      if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Failed to create request');
      const requestId = res.data.id;
      if (files.length > 0) {
        setUploadError(null);
        for (const { file } of files) {
          await documentsApi.upload(requestId, file);
        }
      }
      return requestId;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      router.push(`/student/requests/${id}`);
    },
    onError: (err: Error) => {
      setUploadError(err.message);
    },
  });

  return (
    <Box component="form" onSubmit={handleSubmit((v) => mutation.mutate(v))}>
      <Stack spacing={3}>
        <Typography variant="h6">New Funding Request</Typography>

        {uploadError && <Alert severity="error">{uploadError}</Alert>}

        <Controller
          name="type"
          control={control}
          defaultValue={RequestType.SCHOOL_FEES}
          render={({ field }) => (
            <FormControl fullWidth error={!!errors.type}>
              <InputLabel>Request Type</InputLabel>
              <Select {...field} label="Request Type">
                {typeOptions.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
              {errors.type && <FormHelperText>{errors.type.message}</FormHelperText>}
            </FormControl>
          )}
        />

        <TextField
          label="Amount (USD)"
          type="number"
          inputProps={{ min: 0, step: '0.01' }}
          {...register('amount')}
          error={!!errors.amount}
          helperText={errors.amount?.message}
          fullWidth
        />

        <TextField
          label="Reason"
          multiline
          rows={4}
          {...register('reason')}
          error={!!errors.reason}
          helperText={errors.reason?.message}
          fullWidth
        />

        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Supporting Documents (optional)
          </Typography>
          <DocumentUpload
            files={files}
            onChange={setFiles}
            uploading={mutation.isPending}
          />
        </Box>

        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button variant="outlined" onClick={() => router.back()} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting…' : 'Submit Request'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

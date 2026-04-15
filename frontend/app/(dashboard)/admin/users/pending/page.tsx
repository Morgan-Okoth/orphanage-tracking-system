'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../../../../lib/api/users';
import { User } from '../../../../../lib/types/user';
import ProtectedRoute from '../../../../../components/auth/ProtectedRoute';
import { UserRole } from '../../../../../lib/types/user';

function formatDate(date?: Date | string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString();
}

export default function PendingApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<User | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users-pending'],
    queryFn: () => usersApi.getPendingUsers(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => usersApi.approveUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-pending'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      usersApi.rejectUser(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-pending'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setRejectTarget(null);
      setRejectReason('');
    },
  });

  const users = data?.data ?? [];

  const handleOpenReject = (u: User) => {
    setRejectTarget(u);
    setRejectReason('');
  };

  const handleConfirmReject = () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() });
  };

  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN_LEVEL_1, UserRole.SUPERADMIN]}>
      <Box>
        <Stack direction="row" alignItems="center" spacing={2} mb={3}>
          <Button
            component={Link}
            href="/admin/users"
            startIcon={<ArrowBackIcon />}
            size="small"
          >
            Back to Users
          </Button>
          <Typography variant="h5" fontWeight={700}>
            Pending Approvals
          </Typography>
        </Stack>
        <Divider sx={{ mb: 3 }} />

        {isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Loading…
          </Typography>
        ) : users.length === 0 ? (
          <Box textAlign="center" py={8}>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
            <Typography variant="h6" color="text.secondary">
              No pending approvals
            </Typography>
            <Typography variant="body2" color="text.secondary">
              All user registrations have been reviewed.
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Registered</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>{`${u.firstName} ${u.lastName}`}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.phone}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>{formatDate(u.createdAt)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckCircleOutlineIcon />}
                          onClick={() => approveMutation.mutate(u.id)}
                          disabled={approveMutation.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<CancelOutlinedIcon />}
                          onClick={() => handleOpenReject(u)}
                        >
                          Reject
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Reject modal */}
        <Dialog
          open={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Reject User Registration</DialogTitle>
          <DialogContent>
            <Typography variant="body2" mb={2}>
              Provide a reason for rejecting{' '}
              <strong>
                {rejectTarget?.firstName} {rejectTarget?.lastName}
              </strong>
              . This will be communicated to the user.
            </Typography>
            <TextField
              label="Reason"
              multiline
              rows={3}
              fullWidth
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleConfirmReject}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              Reject
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ProtectedRoute>
  );
}

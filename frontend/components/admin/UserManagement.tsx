'use client';

import { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import RestoreIcon from '@mui/icons-material/Restore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, UserFilters } from '../../lib/api/users';
import { User, UserRole, AccountStatus } from '../../lib/types/user';
import { useAuth } from '../../lib/contexts/AuthContext';

const STATUS_COLOR: Record<AccountStatus, 'warning' | 'success' | 'error' | 'default'> = {
  [AccountStatus.PENDING]: 'warning',
  [AccountStatus.ACTIVE]: 'success',
  [AccountStatus.DEACTIVATED]: 'error',
  [AccountStatus.REJECTED]: 'default',
};

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.ADMIN_LEVEL_1]: 'Admin L1',
  [UserRole.ADMIN_LEVEL_2]: 'Admin L2',
};

function formatDate(date?: Date | string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString();
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  const filters: UserFilters = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    page: page + 1,
    limit: rowsPerPage,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['users', filters],
    queryFn: () => usersApi.listUsers(filters),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeactivateTarget(null);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.reactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const users = data?.data?.items ?? [];
  const total = data?.data?.pagination?.total ?? 0;

  const canActOn = (u: User) =>
    // ADMIN_LEVEL_1 cannot modify ADMIN_LEVEL_2 accounts
    u.role !== UserRole.ADMIN_LEVEL_2 && u.id !== currentUser?.id;

  const handleRoleChange = (e: SelectChangeEvent) => {
    setRoleFilter(e.target.value as UserRole | '');
    setPage(0);
  };

  const handleStatusChange = (e: SelectChangeEvent) => {
    setStatusFilter(e.target.value as AccountStatus | '');
    setPage(0);
  };

  return (
    <Box>
      {/* Filters */}
      <Stack direction="row" spacing={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Role</InputLabel>
          <Select value={roleFilter} label="Role" onChange={handleRoleChange}>
            <MenuItem value="">All Roles</MenuItem>
            <MenuItem value={UserRole.STUDENT}>Student</MenuItem>
            <MenuItem value={UserRole.ADMIN_LEVEL_1}>Admin L1</MenuItem>
            <MenuItem value={UserRole.ADMIN_LEVEL_2}>Admin L2</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={handleStatusChange}>
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value={AccountStatus.PENDING}>Pending</MenuItem>
            <MenuItem value={AccountStatus.ACTIVE}>Active</MenuItem>
            <MenuItem value={AccountStatus.DEACTIVATED}>Deactivated</MenuItem>
            <MenuItem value={AccountStatus.REJECTED}>Rejected</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last Login</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  Loading…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No users found.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{`${u.firstName} ${u.lastName}`}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.phone}</TableCell>
                  <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                  <TableCell>
                    <Chip
                      label={u.accountStatus}
                      size="small"
                      color={STATUS_COLOR[u.accountStatus]}
                    />
                  </TableCell>
                  <TableCell>{formatDate(u.lastLoginAt)}</TableCell>
                  <TableCell align="right">
                    {canActOn(u) && (
                      <>
                        {u.accountStatus === AccountStatus.ACTIVE && (
                          <Tooltip title="Deactivate">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeactivateTarget(u)}
                            >
                              <BlockIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {u.accountStatus === AccountStatus.DEACTIVATED && (
                          <Tooltip title="Reactivate">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => reactivateMutation.mutate(u.id)}
                              disabled={reactivateMutation.isPending}
                            >
                              <RestoreIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 20, 50]}
      />

      {/* Deactivation confirmation dialog */}
      <Dialog open={!!deactivateTarget} onClose={() => setDeactivateTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Deactivate User</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to deactivate{' '}
            <strong>
              {deactivateTarget?.firstName} {deactivateTarget?.lastName}
            </strong>
            ? They will no longer be able to log in.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget.id)}
            disabled={deactivateMutation.isPending}
          >
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

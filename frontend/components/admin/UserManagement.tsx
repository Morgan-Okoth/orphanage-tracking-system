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
  Alert,
  TextField,
  Snackbar,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import RestoreIcon from '@mui/icons-material/Restore';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, UserFilters, CreateUserData } from '../../lib/api/users';
import { User, UserRole, AccountStatus } from '../../lib/types/user';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getRoleLabel } from '../../lib/utils/roleRoutes';

const STATUS_COLOR: Record<AccountStatus, 'warning' | 'success' | 'error' | 'default'> = {
  [AccountStatus.PENDING]: 'warning',
  [AccountStatus.ACTIVE]: 'success',
  [AccountStatus.DEACTIVATED]: 'error',
  [AccountStatus.REJECTED]: 'default',
};

function formatDate(date?: Date | string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString();
}

const initialFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

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

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      usersApi.updateUser(id, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users-pending'] });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (data: CreateUserData) => usersApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateModalOpen(false);
      setFormData(initialFormState);
      setFormError(null);
      setSnackbar({ open: true, message: 'User created successfully', severity: 'success' });
    },
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to create user');
    },
  });

  const users = data?.data?.items ?? [];
  const total = data?.data?.pagination?.total ?? 0;

  const canActOn = (u: User) =>
    currentUser?.role === UserRole.SUPERADMIN
      ? u.id !== currentUser.id
      : u.role !== UserRole.ADMIN_LEVEL_2 &&
        u.role !== UserRole.SUPERADMIN &&
        u.id !== currentUser?.id;

  const canChangeRole = currentUser?.role === UserRole.SUPERADMIN;
  const canCreateUser = currentUser?.role === UserRole.ADMIN_LEVEL_1 || currentUser?.role === UserRole.SUPERADMIN;

  const handleRoleChange = (e: SelectChangeEvent) => {
    setRoleFilter(e.target.value as UserRole | '');
    setPage(0);
  };

  const handleStatusChange = (e: SelectChangeEvent) => {
    setStatusFilter(e.target.value as AccountStatus | '');
    setPage(0);
  };

  const handleFormChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    setFormError(null);
  };

  const handleCreateUser = () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || !formData.password) {
      setFormError('All fields are required');
      return;
    }
    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }
    createUserMutation.mutate({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      role: UserRole.STUDENT,
    });
  };

  return (
    <Box>
      {canChangeRole && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Superadmin can promote, demote, approve, deactivate, and reactivate internal accounts.
        </Alert>
      )}

      {/* Header with Create Button */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">User Accounts</Typography>
        {canCreateUser && (
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => setCreateModalOpen(true)}
          >
            Create Beneficiary
          </Button>
        )}
      </Stack>

      {/* Filters */}
      <Stack direction="row" spacing={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Role</InputLabel>
          <Select value={roleFilter} label="Role" onChange={handleRoleChange}>
            <MenuItem value="">All Roles</MenuItem>
            <MenuItem value={UserRole.STUDENT}>Student</MenuItem>
            <MenuItem value={UserRole.ADMIN_LEVEL_1}>Admin L1</MenuItem>
            <MenuItem value={UserRole.ADMIN_LEVEL_2}>Admin L2</MenuItem>
            <MenuItem value={UserRole.SUPERADMIN}>Superadmin</MenuItem>
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
                  <TableCell>
                    {canChangeRole && canActOn(u) ? (
                      <Select
                        size="small"
                        value={u.role}
                        onChange={(event) =>
                          updateRoleMutation.mutate({
                            id: u.id,
                            role: event.target.value as UserRole,
                          })
                        }
                        disabled={updateRoleMutation.isPending}
                      >
                        <MenuItem value={UserRole.STUDENT}>Beneficiary</MenuItem>
                        <MenuItem value={UserRole.ADMIN_LEVEL_1}>Operations Admin</MenuItem>
                        <MenuItem value={UserRole.ADMIN_LEVEL_2}>Auditor</MenuItem>
                        <MenuItem value={UserRole.SUPERADMIN}>Superadmin</MenuItem>
                      </Select>
                    ) : (
                      getRoleLabel(u.role)
                    )}
                  </TableCell>
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

      {/* Create User Dialog */}
      <Dialog open={createModalOpen} onClose={() => setCreateModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Beneficiary Account</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="First Name"
              value={formData.firstName}
              onChange={handleFormChange('firstName')}
              fullWidth
              required
            />
            <TextField
              label="Last Name"
              value={formData.lastName}
              onChange={handleFormChange('lastName')}
              fullWidth
              required
            />
            <TextField
              label="Email"
              type="email"
              value={formData.email}
              onChange={handleFormChange('email')}
              fullWidth
              required
            />
            <TextField
              label="Phone Number"
              value={formData.phone}
              onChange={handleFormChange('phone')}
              fullWidth
              required
              placeholder="+2547XXXXXXXX"
            />
            <TextField
              label="Password"
              type="password"
              value={formData.password}
              onChange={handleFormChange('password')}
              fullWidth
              required
              helperText="Minimum 8 characters"
            />
            {formError && <Alert severity="error">{formError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateUser}
            disabled={createUserMutation.isPending}
          >
            {createUserMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

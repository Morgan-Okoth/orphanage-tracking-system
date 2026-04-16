'use client';

import { useState } from 'react';
import {
  Box,
  Stack,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Chip,
  Typography,
  Skeleton,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { auditorApi, AuditLogFilters } from '../../lib/api/auditor';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
  { value: 'REQUEST_CREATED', label: 'Request Created' },
  { value: 'REQUEST_APPROVED', label: 'Request Approved' },
  { value: 'REQUEST_REJECTED', label: 'Request Rejected' },
  { value: 'REQUEST_VERIFIED', label: 'Request Verified' },
  { value: 'REQUEST_FLAGGED', label: 'Request Flagged' },
  { value: 'DOCUMENT_UPLOADED', label: 'Document Uploaded' },
  { value: 'STATUS_CHANGED', label: 'Status Changed' },
];

const ACTION_COLORS: Record<string, 'default' | 'success' | 'error' | 'warning' | 'info' | 'primary'> = {
  LOGIN: 'info',
  LOGOUT: 'default',
  REQUEST_CREATED: 'primary',
  REQUEST_APPROVED: 'success',
  REQUEST_REJECTED: 'error',
  REQUEST_VERIFIED: 'success',
  REQUEST_FLAGGED: 'warning',
  DOCUMENT_UPLOADED: 'info',
  STATUS_CHANGED: 'primary',
};

export default function AuditLogViewer() {
  const [filters, setFilters] = useState<AuditLogFilters>({ page: 1, limit: 20 });
  const [draft, setDraft] = useState({ userId: '', action: '', startDate: '', endDate: '' });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => auditorApi.getAuditLogs(filters),
  });

  const logs = data?.data?.items ?? [];
  const pagination = data?.data?.pagination;

  const handleSearch = () => {
    setFilters({
      userId: draft.userId || undefined,
      action: draft.action || undefined,
      startDate: draft.startDate || undefined,
      endDate: draft.endDate || undefined,
      page: 1,
      limit: 20,
    });
  };

  const handleReset = () => {
    setDraft({ userId: '', action: '', startDate: '', endDate: '' });
    setFilters({ page: 1, limit: 20 });
  };

  return (
    <Box>
      {/* Filter form */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
          <TextField
            label="User ID"
            size="small"
            value={draft.userId}
            onChange={(e) => setDraft((d) => ({ ...d, userId: e.target.value }))}
            sx={{ minWidth: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Action</InputLabel>
            <Select
              label="Action"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            >
              {ACTION_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={draft.startDate}
            onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
            sx={{ minWidth: 160 }}
          />
          <TextField
            label="End Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={draft.endDate}
            onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            sx={{ minWidth: 160 }}
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={handleSearch}>
              Search
            </Button>
            <Button variant="outlined" size="small" onClick={handleReset}>
              Reset
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {isError && <Alert severity="error" sx={{ mb: 2 }}>Failed to load audit logs.</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Resource Type</TableCell>
              <TableCell>Resource ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton variant="text" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : logs.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary" py={2}>
                        No audit logs found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )
                : logs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell>
                      <Typography variant="caption">
                        {(() => {
                          try {
                            if (!log.createdAt) return 'N/A';
                            const date = new Date(log.createdAt);
                            if (isNaN(date.getTime())) return 'Invalid date';
                            return format(date, 'MMM d, yyyy HH:mm:ss');
                          } catch {
                            return 'Invalid date';
                          }
                        })()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{log.userName ?? log.userEmail ?? log.userId}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.action}
                        size="small"
                        color={ACTION_COLORS[log.action] ?? 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{log.resourceType}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace">
                        {log.resourceId}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Stack direction="row" spacing={1} justifyContent="center" mt={2}>
          <Chip
            label="Previous"
            clickable
            disabled={!pagination.hasPrev}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          />
          <Chip label={`Page ${pagination.page} of ${pagination.totalPages}`} />
          <Chip
            label="Next"
            clickable
            disabled={!pagination.hasNext}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          />
        </Stack>
      )}
    </Box>
  );
}

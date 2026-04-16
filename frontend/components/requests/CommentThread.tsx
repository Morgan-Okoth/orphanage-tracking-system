'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Avatar,
  Divider,
  CircularProgress,
  FormControlLabel,
  Switch,
  Chip,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, Comment } from '../../lib/api/admin';
import { format } from 'date-fns';

interface Props {
  requestId: string;
  /** When true, shows the internal comment toggle (admin view) */
  allowInternal?: boolean;
}

function CommentItem({ comment }: { comment: Comment }) {
  const initials = comment.authorName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Box
      sx={
        comment.isInternal
          ? {
              bgcolor: 'rgba(237, 108, 2, 0.08)',
              border: '1px dashed',
              borderColor: 'warning.main',
              borderRadius: 1,
              p: 1.5,
            }
          : undefined
      }
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>{initials}</Avatar>
        <Box flex={1}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="subtitle2">{comment.authorName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {comment.authorRole}
            </Typography>
            {comment.isInternal && (
              <Chip
                icon={<LockIcon sx={{ fontSize: 12 }} />}
                label="Internal"
                size="small"
                color="warning"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
            )}
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              {(() => {
                try {
                  if (!comment.createdAt) return 'N/A';
                  const date = new Date(comment.createdAt);
                  if (isNaN(date.getTime())) return 'Invalid date';
                  return format(date, 'MMM d, yyyy HH:mm');
                } catch {
                  return 'Invalid date';
                }
              })()}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {comment.content}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

export default function CommentThread({ requestId, allowInternal = true }: Props) {
  const [text, setText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['comments', requestId],
    queryFn: () => adminApi.getComments(requestId),
  });

  const mutation = useMutation({
    mutationFn: (vars: { content: string; isInternal: boolean }) =>
      adminApi.addComment(requestId, vars.content, vars.isInternal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', requestId] });
      setText('');
    },
  });

  const comments = Array.isArray(data?.data) ? data.data : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) mutation.mutate({ content: text.trim(), isInternal });
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Comments
      </Typography>

      {isLoading ? (
        <CircularProgress size={20} />
      ) : comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No comments yet.
        </Typography>
      ) : (
        <Stack spacing={2} divider={<Divider />} sx={{ mb: 2 }}>
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </Stack>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          placeholder="Add a comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
          {allowInternal && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  color="warning"
                />
              }
              label={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <LockIcon sx={{ fontSize: 14, color: isInternal ? 'warning.main' : 'text.disabled' }} />
                  <Typography variant="caption" color={isInternal ? 'warning.main' : 'text.secondary'}>
                    Internal (admin only)
                  </Typography>
                </Stack>
              }
            />
          )}
          <Button
            type="submit"
            variant="contained"
            size="small"
            color={isInternal ? 'warning' : 'primary'}
            disabled={!text.trim() || mutation.isPending}
            sx={{ ml: 'auto' }}
          >
            {mutation.isPending ? 'Posting…' : 'Post Comment'}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

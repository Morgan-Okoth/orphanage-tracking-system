'use client';

import { useCallback, useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  LinearProgress,
  Alert,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';

interface UploadedFile {
  file: File;
  id: string;
}

interface Props {
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  accept?: string;
  uploading?: boolean;
}

export default function DocumentUpload({
  files,
  onChange,
  maxFiles = 5,
  accept = '.pdf,.jpg,.jpeg,.png',
  uploading = false,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      setError(null);
      const newFiles = Array.from(incoming);
      if (files.length + newFiles.length > maxFiles) {
        setError(`You can upload at most ${maxFiles} files.`);
        return;
      }
      const mapped: UploadedFile[] = newFiles.map((f) => ({
        file: f,
        id: `${f.name}-${Date.now()}-${Math.random()}`,
      }));
      onChange([...files, ...mapped]);
    },
    [files, maxFiles, onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleRemove = (id: string) => {
    onChange(files.filter((f) => f.id !== id));
  };

  return (
    <Box>
      <Box
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        sx={{
          border: '2px dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: dragOver ? 'action.hover' : 'background.paper',
          transition: 'all 0.2s',
        }}
        onClick={() => document.getElementById('doc-upload-input')?.click()}
      >
        <UploadFileIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
        <Typography variant="body1">Drag & drop files here, or click to browse</Typography>
        <Typography variant="caption" color="text.secondary">
          Accepted: {accept} — max {maxFiles} files
        </Typography>
        <input
          id="doc-upload-input"
          type="file"
          multiple
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </Box>

      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {uploading && <LinearProgress sx={{ mt: 1 }} />}

      {files.length > 0 && (
        <List dense sx={{ mt: 1 }}>
          {files.map(({ file, id }) => (
            <ListItem key={id} disableGutters>
              <ListItemText
                primary={file.name}
                secondary={`${(file.size / 1024).toFixed(1)} KB`}
              />
              <ListItemSecondaryAction>
                <IconButton edge="end" size="small" onClick={() => handleRemove(id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}

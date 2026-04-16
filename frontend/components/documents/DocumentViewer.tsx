'use client';

import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DownloadIcon from '@mui/icons-material/Download';
import { useQuery } from '@tanstack/react-query';
import { documentsApi } from '../../lib/api/documents';
import { Document } from '../../lib/types/document';

interface Props {
  requestId: string;
}

function fileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return <ImageIcon />;
  if (fileType === 'application/pdf') return <PictureAsPdfIcon />;
  return <DescriptionIcon />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentRow({ doc }: { doc: Document }) {
  const handleDownload = async () => {
    try {
      const blob = await documentsApi.download(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user can retry
    }
  };

  return (
    <ListItem
      disableGutters
      secondaryAction={
        <Tooltip title="Download">
          <IconButton edge="end" size="small" onClick={handleDownload}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      }
    >
      <ListItemIcon sx={{ minWidth: 36 }}>{fileIcon(doc.fileType)}</ListItemIcon>
      <ListItemText
        primary={doc.fileName}
        secondary={`${formatSize(doc.fileSize)} · v${doc.version}`}
        primaryTypographyProps={{ variant: 'body2' }}
        secondaryTypographyProps={{ variant: 'caption' }}
      />
    </ListItem>
  );
}

export default function DocumentViewer({ requestId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['request-docs', requestId],
    queryFn: () => documentsApi.list(requestId),
  });

  const docs = (Array.isArray(data?.data) ? data.data : []).filter((d) => !d.isDeleted);

  if (isLoading) return <CircularProgress size={20} />;
  if (isError) return <Alert severity="error">Failed to load documents.</Alert>;
  if (docs.length === 0)
    return (
      <Typography variant="body2" color="text.secondary">
        No documents uploaded.
      </Typography>
    );

  return (
    <Box>
      <List dense disablePadding>
        {docs.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} />
        ))}
      </List>
    </Box>
  );
}

import { Chip } from '@mui/material';
import { RequestStatus } from '../../lib/types/request';

const statusConfig: Record<
  RequestStatus,
  { label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' }
> = {
  [RequestStatus.SUBMITTED]: { label: 'Submitted', color: 'info' },
  [RequestStatus.UNDER_REVIEW]: { label: 'Under Review', color: 'primary' },
  [RequestStatus.PENDING_DOCUMENTS]: { label: 'Pending Documents', color: 'warning' },
  [RequestStatus.APPROVED]: { label: 'Approved', color: 'success' },
  [RequestStatus.VERIFIED]: { label: 'Verified', color: 'success' },
  [RequestStatus.PAID]: { label: 'Paid', color: 'success' },
  [RequestStatus.DISPUTED]: { label: 'Disputed', color: 'error' },
  [RequestStatus.RESOLVED]: { label: 'Resolved', color: 'success' },
  [RequestStatus.REJECTED]: { label: 'Rejected', color: 'error' },
  [RequestStatus.FLAGGED]: { label: 'Flagged', color: 'warning' },
  [RequestStatus.ARCHIVED]: { label: 'Archived', color: 'default' },
};

interface Props {
  status: RequestStatus;
  size?: 'small' | 'medium';
}

export default function RequestStatusBadge({ status, size = 'small' }: Props) {
  const config = statusConfig[status] ?? { label: status, color: 'default' as const };
  return <Chip label={config.label} color={config.color} size={size} />;
}

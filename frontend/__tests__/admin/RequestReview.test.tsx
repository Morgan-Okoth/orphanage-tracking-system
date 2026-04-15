import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils';
import RequestReview from '../../components/requests/RequestReview';
import { RequestStatus } from '../../lib/types/request';

// Mock adminApi
vi.mock('../../lib/api/admin', () => ({
  adminApi: {
    startReview: vi.fn(),
    approveRequest: vi.fn(),
    rejectRequest: vi.fn(),
    requestDocuments: vi.fn(),
  },
}));

import { adminApi } from '../../lib/api/admin';
const mockStartReview = vi.mocked(adminApi.startReview);
const mockApprove = vi.mocked(adminApi.approveRequest);
const mockReject = vi.mocked(adminApi.rejectRequest);
const mockRequestDocs = vi.mocked(adminApi.requestDocuments);

const REQUEST_ID = 'req-abc-123';

describe('RequestReview', () => {
  beforeEach(() => {
    mockStartReview.mockReset();
    mockApprove.mockReset();
    mockReject.mockReset();
    mockRequestDocs.mockReset();
  });

  describe('SUBMITTED status', () => {
    it('shows Start Review button', () => {
      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.SUBMITTED} />);
      expect(screen.getByRole('button', { name: /start review/i })).toBeInTheDocument();
    });

    it('calls startReview when button is clicked', async () => {
      const user = userEvent.setup();
      mockStartReview.mockResolvedValueOnce({ success: true });

      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.SUBMITTED} />);
      await user.click(screen.getByRole('button', { name: /start review/i }));

      await waitFor(() => {
        expect(mockStartReview).toHaveBeenCalledWith(REQUEST_ID);
      });
    });
  });

  describe('UNDER_REVIEW status', () => {
    it('shows Approve, Reject, and Request Docs buttons', () => {
      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.UNDER_REVIEW} />);
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /request docs/i })).toBeInTheDocument();
    });

    it('opens approval dialog and submits', async () => {
      const user = userEvent.setup();
      mockApprove.mockResolvedValueOnce({ success: true });

      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.UNDER_REVIEW} />);
      await user.click(screen.getByRole('button', { name: /approve/i }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/approve request/i)).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: /^approve$/i }));

      await waitFor(() => {
        expect(mockApprove).toHaveBeenCalledWith(REQUEST_ID, undefined);
      });
    });

    it('opens rejection dialog and requires reason', async () => {
      const user = userEvent.setup();
      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.UNDER_REVIEW} />);

      await user.click(screen.getByRole('button', { name: /reject/i }));
      const dialog = screen.getByRole('dialog');

      // Try to submit without reason
      await user.click(within(dialog).getByRole('button', { name: /^reject$/i }));

      await waitFor(() => {
        expect(screen.getByText(/rejection reason is required/i)).toBeInTheDocument();
      });
    });

    it('submits rejection with reason', async () => {
      const user = userEvent.setup();
      mockReject.mockResolvedValueOnce({ success: true });

      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.UNDER_REVIEW} />);
      await user.click(screen.getByRole('button', { name: /reject/i }));

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByRole('textbox'), 'Insufficient documentation provided');
      await user.click(within(dialog).getByRole('button', { name: /^reject$/i }));

      await waitFor(() => {
        expect(mockReject).toHaveBeenCalledWith(REQUEST_ID, 'Insufficient documentation provided');
      });
    });

    it('opens request-docs dialog and submits message', async () => {
      const user = userEvent.setup();
      mockRequestDocs.mockResolvedValueOnce({ success: true });

      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.UNDER_REVIEW} />);
      await user.click(screen.getByRole('button', { name: /request docs/i }));

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByRole('textbox'), 'Please provide a medical certificate');
      await user.click(within(dialog).getByRole('button', { name: /send request/i }));

      await waitFor(() => {
        expect(mockRequestDocs).toHaveBeenCalledWith(REQUEST_ID, 'Please provide a medical certificate');
      });
    });
  });

  describe('processed statuses', () => {
    it('shows already processed message for PAID status', () => {
      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.PAID} />);
      expect(screen.getByText(/already been processed/i)).toBeInTheDocument();
    });

    it('shows already processed message for VERIFIED status', () => {
      render(<RequestReview requestId={REQUEST_ID} currentStatus={RequestStatus.VERIFIED} />);
      expect(screen.getByText(/already been processed/i)).toBeInTheDocument();
    });
  });
});

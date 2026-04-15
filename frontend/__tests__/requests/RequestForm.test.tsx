import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils';
import RequestForm from '../../components/requests/RequestForm';
import { RequestStatus, RequestType } from '../../lib/types/request';

// Mock Next.js router
const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// Mock APIs
vi.mock('../../lib/api/requests', () => ({
  requestsApi: {
    create: vi.fn(),
  },
}));

vi.mock('../../lib/api/documents', () => ({
  documentsApi: {
    upload: vi.fn(),
  },
}));

// Mock DocumentUpload with a button that injects a file into the form
vi.mock('../../components/documents/DocumentUpload', () => ({
  default: ({ onChange }: { onChange: (files: Array<{ file: File; id: string }>) => void }) => (
    <button
      type="button"
      data-testid="document-upload"
      onClick={() =>
        onChange([
          {
            id: 'doc-1',
            file: new File(['stub'], 'supporting-document.pdf', {
              type: 'application/pdf',
            }),
          },
        ])
      }
    >
      Add document
    </button>
  ),
}));

import { requestsApi } from '../../lib/api/requests';
const mockCreate = vi.mocked(requestsApi.create);

describe('RequestForm', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockPush.mockReset();
  });

  it('renders all form fields', () => {
    render(<RequestForm />);
    expect(screen.getByText(/new funding request/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit request/i })).toBeInTheDocument();
  });

  it('shows validation error when amount is missing', async () => {
    const user = userEvent.setup();
    render(<RequestForm />);

    await user.type(screen.getByLabelText(/reason/i), 'Need funds for school fees this term');
    await user.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(screen.getByText(/amount must be positive/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when reason is too short', async () => {
    const user = userEvent.setup();
    render(<RequestForm />);

    await user.type(screen.getByLabelText(/amount/i), '5000');
    await user.type(screen.getByLabelText(/reason/i), 'Short');
    await user.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
    });
  });

  it('submits form and redirects on success', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'req-123',
        studentId: 'student-1',
        type: RequestType.SCHOOL_FEES,
        amount: 5000,
        reason: 'Need school fees',
        status: RequestStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    render(<RequestForm />);

    await user.type(screen.getByLabelText(/amount/i), '5000');
    await user.type(screen.getByLabelText(/reason/i), 'Need funds for school fees this term');
    await user.click(screen.getByTestId('document-upload'));
    await user.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000, reason: 'Need funds for school fees this term' }),
        expect.arrayContaining([expect.any(File)]),
      );
      expect(mockPush).toHaveBeenCalledWith('/student/requests/req-123');
    });
  });

  it('shows error alert when submission fails', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValueOnce({ success: false, error: { code: 'ERR', message: 'Server error' } });

    render(<RequestForm />);

    await user.type(screen.getByLabelText(/amount/i), '5000');
    await user.type(screen.getByLabelText(/reason/i), 'Need funds for school fees this term');
    await user.click(screen.getByTestId('document-upload'));
    await user.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error when no supporting document is attached', async () => {
    const user = userEvent.setup();
    render(<RequestForm />);

    await user.type(screen.getByLabelText(/amount/i), '5000');
    await user.type(screen.getByLabelText(/reason/i), 'Need funds for school fees this term');
    await user.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/at least one supporting document is required/i);
    });
  });

  it('cancel button calls router.back', async () => {
    const user = userEvent.setup();
    render(<RequestForm />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockBack).toHaveBeenCalled();
  });
});

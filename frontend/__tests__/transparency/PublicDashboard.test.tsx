import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import { render } from '../test-utils';
import PublicDashboard from '../../components/transparency/PublicDashboard';

// Mock publicApi
vi.mock('../../lib/api/public', () => ({
  publicApi: {
    getStatistics: vi.fn(),
    getMonthlyStatistics: vi.fn(),
  },
}));

// Mock FundingChart to avoid canvas issues in jsdom
vi.mock('../../components/transparency/FundingChart', () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="funding-chart">Chart ({data.length} points)</div>
  ),
}));

import { publicApi } from '../../lib/api/public';
const mockGetStats = vi.mocked(publicApi.getStatistics);
const mockGetMonthly = vi.mocked(publicApi.getMonthlyStatistics);

const mockStats = {
  totalReceived: 1500000,
  totalDisbursed: 1200000,
  requestsApproved: 85,
  requestsRejected: 12,
  amountsByType: {
    SCHOOL_FEES: 800000,
    MEDICAL_EXPENSES: 300000,
    SUPPLIES: 100000,
  },
};

const mockMonthly = [
  { month: '2026-01', totalReceived: 200000, totalDisbursed: 180000, requestsApproved: 10, requestsRejected: 2 },
  { month: '2026-02', totalReceived: 250000, totalDisbursed: 220000, requestsApproved: 12, requestsRejected: 1 },
];

describe('PublicDashboard', () => {
  it('renders statistics cards with data', async () => {
    mockGetStats.mockResolvedValueOnce(mockStats);
    mockGetMonthly.mockResolvedValueOnce(mockMonthly);

    render(<PublicDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Received')).toBeInTheDocument();
      expect(screen.getByText('Total Disbursed')).toBeInTheDocument();
      expect(screen.getByText('Requests Approved')).toBeInTheDocument();
      expect(screen.getByText('Requests Rejected')).toBeInTheDocument();
    });
  });

  it('renders monthly breakdown table', async () => {
    mockGetStats.mockResolvedValueOnce(mockStats);
    mockGetMonthly.mockResolvedValueOnce(mockMonthly);

    render(<PublicDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Monthly Breakdown')).toBeInTheDocument();
    });
  });

  it('renders funding chart', async () => {
    mockGetStats.mockResolvedValueOnce(mockStats);
    mockGetMonthly.mockResolvedValueOnce(mockMonthly);

    render(<PublicDashboard />);

    // The chart is inside LazySection — trigger intersection to reveal it
    act(() => {
      const calls = (IntersectionObserver as ReturnType<typeof vi.fn>).mock.calls;
      calls.forEach(([callback]: [IntersectionObserverCallback]) => {
        callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('funding-chart')).toBeInTheDocument();
    });
  });

  it('shows error alert when stats fetch fails', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('Network error'));
    mockGetMonthly.mockResolvedValueOnce([]);

    render(<PublicDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/failed to load transparency data/i)).toBeInTheDocument();
    });
  });

  it('shows empty state message when no monthly data', async () => {
    mockGetStats.mockResolvedValueOnce(mockStats);
    mockGetMonthly.mockResolvedValueOnce([]);

    render(<PublicDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/no monthly data available/i)).toBeInTheDocument();
    });
  });
});

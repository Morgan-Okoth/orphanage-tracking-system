import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test-utils';
import StatisticsCard from '../../components/transparency/StatisticsCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

describe('StatisticsCard', () => {
  it('renders title and value', () => {
    render(<StatisticsCard title="Total Disbursed" value="KES 500,000" />);
    expect(screen.getByText('Total Disbursed')).toBeInTheDocument();
    expect(screen.getByText('KES 500,000')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <StatisticsCard
        title="Requests Approved"
        value={42}
        subtitle="Successfully funded requests"
      />,
    );
    expect(screen.getByText('Successfully funded requests')).toBeInTheDocument();
  });

  it('renders numeric value', () => {
    render(<StatisticsCard title="Count" value={123} />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const { container } = render(
      <StatisticsCard title="Balance" value="KES 1,000" icon={AccountBalanceIcon} />,
    );
    // MUI renders SVG icons
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    render(<StatisticsCard title="Total" value="100" />);
    // Only title and value should be present, no extra text
    expect(screen.queryByText(/subtitle/i)).not.toBeInTheDocument();
  });
});

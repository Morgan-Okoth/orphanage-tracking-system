import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils';
import RegisterForm from '../../components/auth/RegisterForm';

// Mock authApi
vi.mock('../../lib/api/auth', () => ({
  authApi: {
    register: vi.fn(),
  },
}));

import { authApi } from '../../lib/api/auth';
const mockRegister = vi.mocked(authApi.register);

// Helper: get password field by input name attribute
function getPasswordInput(container: HTMLElement) {
  return container.querySelector('input[name="password"]') as HTMLElement;
}
function getConfirmPasswordInput(container: HTMLElement) {
  return container.querySelector('input[name="confirmPassword"]') as HTMLElement;
}

describe('RegisterForm', () => {
  beforeEach(() => {
    mockRegister.mockReset();
  });

  it('renders all required fields', () => {
    const { container } = render(<RegisterForm />);
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(getPasswordInput(container)).toBeInTheDocument();
    expect(getConfirmPasswordInput(container)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows validation errors for empty required fields', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/last name is required/i)).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />);

    await user.type(screen.getByLabelText(/first name/i), 'John');
    await user.type(screen.getByLabelText(/last name/i), 'Doe');
    await user.type(screen.getByLabelText(/email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/phone/i), '0712345678');
    await user.type(getPasswordInput(container), 'password123');
    await user.type(getConfirmPasswordInput(container), 'different456');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('shows success message after successful registration', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValueOnce({ success: true, data: undefined });

    const { container } = render(<RegisterForm />);

    await user.type(screen.getByLabelText(/first name/i), 'John');
    await user.type(screen.getByLabelText(/last name/i), 'Doe');
    await user.type(screen.getByLabelText(/email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/phone/i), '0712345678');
    await user.type(getPasswordInput(container), 'password123');
    await user.type(getConfirmPasswordInput(container), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/pending approval/i)).toBeInTheDocument();
    });
  });

  it('shows error alert when registration fails', async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValueOnce(new Error('Email already exists'));

    const { container } = render(<RegisterForm />);

    await user.type(screen.getByLabelText(/first name/i), 'John');
    await user.type(screen.getByLabelText(/last name/i), 'Doe');
    await user.type(screen.getByLabelText(/email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/phone/i), '0712345678');
    await user.type(getPasswordInput(container), 'password123');
    await user.type(getConfirmPasswordInput(container), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/registration failed\. please try again\./i)).toBeInTheDocument();
    });
  });
});

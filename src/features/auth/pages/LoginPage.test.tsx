import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';
import { authApi } from '../api/authApi';

vi.mock('../api/authApi', () => ({
  authApi: { login: vi.fn(), signInWithGoogle: vi.fn() },
}));

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(authApi.login).mockReset();
    vi.mocked(authApi.signInWithGoogle).mockReset();
  });

  it('triggers Google sign-in when the Google button is clicked', async () => {
    vi.mocked(authApi.signInWithGoogle).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(authApi.signInWithGoogle).toHaveBeenCalledTimes(1);
    });
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('submits email and password to authApi.login', async () => {
    // Navigation itself is driven by initAuth.ts's onAuthStateChanged
    // listener reacting to the real sign-in, not by this mutation directly —
    // this test only verifies the form calls authApi.login with the right args.
    vi.mocked(authApi.login).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'priya@example.com');
    await user.type(screen.getByLabelText(/password/i), 'hunter22practice');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    // Assert on just the first argument — TanStack Query v5 calls
    // mutationFn with an internal context object as a second argument, which
    // toHaveBeenCalledWith would otherwise (incorrectly) fail on.
    await waitFor(() => {
      expect(vi.mocked(authApi.login).mock.calls[0]?.[0]).toEqual({
        email: 'priya@example.com',
        password: 'hunter22practice',
      });
    });
  });

  it('shows a validation error for an invalid email instead of calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });
});

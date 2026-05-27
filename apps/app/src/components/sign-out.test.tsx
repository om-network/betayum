import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockSignOut } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: mockSignOut }),
}));

import { SignOut } from './sign-out';

describe('SignOut', () => {
  it('signs out through Clerk and redirects to auth', async () => {
    mockSignOut.mockResolvedValueOnce(undefined);

    render(<SignOut asButton />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledWith({ redirectUrl: '/auth' });
    });
  });
});

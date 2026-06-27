// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

vi.mock('@/components/google-sign-in', () => ({
  GoogleSignIn: () => <button type="button">Continue with Google</button>,
}));

vi.mock('@/components/microsoft-sign-in', () => ({
  MicrosoftSignIn: () => <button type="button">Continue with Microsoft</button>,
}));

vi.mock('@/components/github-sign-in', () => ({
  GithubSignIn: () => <button type="button">Continue with GitHub</button>,
}));

vi.mock('@/components/magic-link', () => ({
  MagicLinkSignIn: () => <button type="button">Continue with Magic Link</button>,
}));

describe('LoginForm', () => {
  it('shows Google and Microsoft sign-in even when app-side provider flags are false', () => {
    render(
      <LoginForm
        showGoogle={false}
        showGithub={false}
        showMicrosoft={false}
      />,
    );

    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /continue with microsoft/i }),
    ).toBeInTheDocument();
  });

  it('keeps GitHub behind more options when enabled', () => {
    render(
      <LoginForm
        showGoogle={false}
        showGithub={true}
        showMicrosoft={false}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /continue with github/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more options/i }));

    expect(
      screen.getByRole('button', { name: /continue with github/i }),
    ).toBeInTheDocument();
  });
});

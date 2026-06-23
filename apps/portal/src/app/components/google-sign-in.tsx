'use client';

import { createBrowserAuthClient } from '@/app/lib/auth-client';
import { Button } from '@trycompai/ui/button';
import { Icons } from '@trycompai/ui/icons';
import { Spinner } from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';

export function GoogleSignIn({
  inviteCode,
  searchParams,
}: {
  inviteCode?: string;
  searchParams?: URLSearchParams;
}) {
  const [isLoading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);

    try {
      const authClient = createBrowserAuthClient();

      // Build the callback URL with search params
      const baseURL = window.location.origin;
      const isDeviceAuth = searchParams?.get('device_auth') === 'true';
      const path = isDeviceAuth
        ? '/auth/device-callback'
        : inviteCode
          ? `/invite/${inviteCode}`
          : '/';
      const redirectTo = new URL(path, baseURL);

      if (searchParams) {
        searchParams.forEach((value, key) => {
          redirectTo.searchParams.append(key, value);
        });
      }

      await authClient.signIn.social({
        provider: 'google',
        callbackURL: redirectTo.toString(),
      });
    } catch (error) {
      setLoading(false);

      console.error('[Google Sign-In] Authentication failed:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });

      if (error instanceof Error) {
        if (error.message.includes('redirect_uri_mismatch')) {
          toast.error('Configuration error', {
            description: 'Redirect URI mismatch. Please update the Google OAuth client.',
          });
        } else if (error.message.includes('invalid_client')) {
          toast.error('Invalid credentials', {
            description: 'Google OAuth credentials are invalid. Please contact support.',
          });
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          toast.error('Network error', {
            description: 'Please check your internet connection and try again.',
          });
        } else {
          toast.error('Sign-in failed', {
            description: error.message || 'An unexpected error occurred. Please try again.',
          });
        }
      } else {
        toast.error('Failed to sign in with Google', {
          description: 'An unexpected error occurred. Please try again.',
        });
      }
    }
  };

  return (
    <Button
      onClick={handleSignIn}
      className="w-full h-11 font-medium"
      variant="outline"
      disabled={isLoading}
    >
      {isLoading ? (
        <Spinner size="sm" />
      ) : (
        <>
          <Icons.Google className="h-4 w-4" />
          Continue with Google
        </>
      )}
    </Button>
  );
}

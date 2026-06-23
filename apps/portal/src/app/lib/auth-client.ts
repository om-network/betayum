import {
  emailOTPClient,
  multiSessionClient,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { ac, allRoles } from '@trycompai/auth';

function isNgrokHost(hostname: string) {
  return hostname.endsWith('.ngrok-free.dev') || hostname.endsWith('.ngrok-free.app');
}

function getConfiguredApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
}

function getAuthBaseUrl() {
  const configuredApiUrl = getConfiguredApiUrl();

  if (typeof window === 'undefined') {
    return configuredApiUrl;
  }

  if (isNgrokHost(window.location.hostname)) {
    return window.location.origin;
  }

  return configuredApiUrl;
}

function buildAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [
      organizationClient({ ac, roles: allRoles }),
      emailOTPClient(),
      multiSessionClient(),
    ],
  });
}

export function createBrowserAuthClient() {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

  if (typeof window === 'undefined') {
    return buildAuthClient(configuredApiUrl);
  }

  return buildAuthClient(getAuthBaseUrl());
}

export const authClient = buildAuthClient(getAuthBaseUrl());

export const {
  signIn,
  signOut,
  useSession,
  useActiveOrganization,
  organization,
  useListOrganizations,
  useActiveMember,
} = authClient;

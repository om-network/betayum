'use client';

import {
  canAccessAuditorViewFromClerk,
  hasPermission,
  type UserPermissions,
} from '@/lib/permissions';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';

interface PermissionsResponse {
  permissions: UserPermissions;
  organizationRole: string | null;
}

const emptyPermissions: UserPermissions = {};

export function usePermissions() {
  const pathname = usePathname();
  const { data } = useSWR(
    pathname ? ['/api/auth/permissions', pathname] : null,
    async ([url]) => {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return { permissions: emptyPermissions, organizationRole: null };
      }

      return response.json() as Promise<PermissionsResponse>;
    },
    { revalidateOnFocus: false },
  );

  const permissions = data?.permissions ?? emptyPermissions;
  const organizationRole = data?.organizationRole ?? null;

  return {
    permissions,
    customPermissions: permissions,
    obligations: {},
    roles: organizationRole ? [organizationRole.replace(/^org:/, '')] : [],
    hasPermission: (resource: string, action: string) =>
      hasPermission(permissions, resource, action),
    canAccessAuditorView: canAccessAuditorViewFromClerk({
      organizationRole,
      permissions,
    }),
  };
}

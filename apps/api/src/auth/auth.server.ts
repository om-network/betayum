export {
  getTrustedOrigins,
  isStaticTrustedOrigin,
  isTrustedOrigin,
} from './trusted-origins';

type AuthSession = {
  user?: { id?: string | null } | null;
  session?: { id?: string; activeOrganizationId?: string | null } | null;
};

// Compatibility shim for older tests that still mock/import auth.server.
// Runtime authentication is Clerk-backed and no longer depends on this module.
export const auth = {
  api: {
    async getSession(): Promise<AuthSession | null> {
      throw new Error('auth.server is retired; use ClerkSessionService instead.');
    },
    async hasPermission(): Promise<{ success: boolean }> {
      throw new Error(
        'auth.server is retired; use PermissionEvaluatorService instead.',
      );
    },
  },
};

'use client';

function redirectToAuth(callbackURL?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const redirectTo = callbackURL ? `?redirectTo=${encodeURIComponent(callbackURL)}` : '';
  window.location.assign(`/auth${redirectTo}`);
}

export const authClient = {
  signIn: {
    social: async ({ callbackURL }: { provider: string; callbackURL?: string }) => {
      redirectToAuth(callbackURL);
      return { error: null };
    },
    emailOtp: async ({ deviceAuthRedirect }: { email: string; otp: string; deviceAuthRedirect?: string }) => {
      redirectToAuth(deviceAuthRedirect);
      return { error: null };
    },
  },
  emailOtp: {
    sendVerificationOtp: async ({ deviceAuthRedirect }: { email: string; type: string; deviceAuthRedirect?: string }) => {
      redirectToAuth(deviceAuthRedirect);
      return { data: null, error: null };
    },
  },
};

export const signIn = authClient.signIn;
export const signOut = async ({ redirectUrl = '/auth' }: { redirectUrl?: string }) => {
  if (typeof window !== 'undefined') {
    window.location.assign(redirectUrl);
  }
};
export const useSession = () => ({ data: null, isPending: false });
export const useActiveOrganization = () => ({ data: null, isPending: false });
export const organization = {
  setActive: async ({ organizationId }: { organizationId: string }) => ({
    data: { organizationId },
    error: null,
  }),
};
export const useListOrganizations = () => ({ data: [], isPending: false });
export const useActiveMember = () => ({ data: null, isPending: false });

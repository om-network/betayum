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
  },
};

export const signIn = authClient.signIn;
export const signOut = async ({ redirectUrl = '/auth' }: { redirectUrl?: string }) => {
  if (typeof window !== 'undefined') {
    window.location.assign(redirectUrl);
  }
};
export const useSession = () => ({ data: null, isPending: false });

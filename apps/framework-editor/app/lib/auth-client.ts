'use client';

function getBrowserClerk() {
  if (typeof window === 'undefined') return null;
  return (window as Window & { Clerk?: { signOut: (options?: { redirectUrl?: string }) => Promise<void> } })
    .Clerk;
}

export const authClient = {
  signIn: {
    async social() {
      if (typeof window !== 'undefined') {
        window.location.href = '/auth';
      }
    },
  },
  async signOut(options?: { fetchOptions?: { onSuccess?: () => void }; redirectTo?: string }) {
    const clerk = getBrowserClerk();
    await clerk?.signOut({ redirectUrl: options?.redirectTo });
    options?.fetchOptions?.onSuccess?.();
  },
};

export const signOut = authClient.signOut;

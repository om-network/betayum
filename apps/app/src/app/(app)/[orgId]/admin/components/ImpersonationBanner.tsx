'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type SupportContextState =
  | {
      active: false;
    }
  | {
      active: true;
      context: {
        organizationId: string;
        organizationName: string;
        targetUserId: string;
        targetUserName: string;
        targetUserEmail: string;
        expiresAt: number;
      };
    };

export function ImpersonationBanner() {
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const [state, setState] = useState<SupportContextState>({ active: false });

  useEffect(() => {
    let active = true;

    void fetch('/api/admin/support-context', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          return { active: false } as SupportContextState;
        }

        return (await response.json()) as SupportContextState;
      })
      .then((nextState) => {
        if (active) {
          setState(nextState);
        }
      })
      .catch(() => {
        if (active) {
          setState({ active: false });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!state.active) return null;

  const handleStop = async () => {
    setStopping(true);
    try {
      await fetch(
        `/api/admin/support-context?organizationId=${encodeURIComponent(state.context.organizationId)}`,
        {
          method: 'DELETE',
        },
      );
      setState({ active: false });
      router.push(`/${state.context.organizationId}/admin/organizations`);
      router.refresh();
    } catch {
      setStopping(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
      <span>
        Support context active for{' '}
        <span className="font-medium">{state.context.targetUserName}</span> (
        {state.context.targetUserEmail}) in {state.context.organizationName}
      </span>
      <button
        onClick={handleStop}
        disabled={stopping}
        className="rounded-md border border-destructive/30 px-2.5 py-1 font-medium transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {stopping ? 'Stopping...' : 'Stop Support Context'}
      </button>
    </div>
  );
}

export type PersistedCodexRun = {
  errorMessage: string | null;
  id: string;
  screenshots: Array<{ attachmentId: string | null }>;
  status: string;
  summary: string | null;
};

export type CodexWaitResult = {
  output: { attachmentIds: string[]; summary: string };
  status: 'COMPLETED' | 'FAILED' | 'TIMED_OUT';
};

export function persistedCodexResult(run: PersistedCodexRun | null): CodexWaitResult | null {
  if (!run) return null;
  if (run.status === 'promoted') {
    return {
      output: {
        attachmentIds: run.screenshots.flatMap((screenshot) =>
          screenshot.attachmentId ? [screenshot.attachmentId] : [],
        ),
        summary: run.summary ?? '',
      },
      status: 'COMPLETED',
    };
  }
  if (run.status === 'failed' || run.status === 'timed_out') {
    return {
      output: {
        attachmentIds: [],
        summary: run.errorMessage ?? run.summary ?? 'Codex returned no result.',
      },
      status: run.status === 'timed_out' ? 'TIMED_OUT' : 'FAILED',
    };
  }
  return null;
}

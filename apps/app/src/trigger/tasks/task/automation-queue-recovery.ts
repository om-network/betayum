const TERMINAL_CODEX_STATUSES = new Set(['failed', 'promoted', 'timed_out']);

export function needsAutomationQueueRecovery(item: {
  automation: {
    assistantRun: { status: string } | null;
    codexRuns: Array<{ status: string }>;
  } | null;
  status: string;
}) {
  if (item.status !== 'building' || !item.automation) return false;
  if (item.automation.assistantRun) return false;
  return item.automation.codexRuns.some((run) => TERMINAL_CODEX_STATUSES.has(run.status));
}

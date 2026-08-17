export type AutomationProvider = 'gcp' | 'github';

const AUTOMATABLE_TASKS: Readonly<Record<string, AutomationProvider>> = {
  'app availability': 'gcp',
  'code changes': 'github',
  'encryption at rest': 'gcp',
  'monitoring & alerting': 'gcp',
  'production firewall & no-public-access controls': 'gcp',
  'sanitized inputs': 'github',
  'secure secrets': 'gcp',
  'separation of environments': 'gcp',
  'static code scanning': 'github',
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getAutomationProvider(title: string): AutomationProvider | null {
  return AUTOMATABLE_TASKS[normalizeTitle(title)] ?? null;
}

export function isTaskAutomatable(title: string): boolean {
  return getAutomationProvider(title) !== null;
}

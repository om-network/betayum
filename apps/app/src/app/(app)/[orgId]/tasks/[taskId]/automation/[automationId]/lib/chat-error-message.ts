const AUTOMATION_GENERATION_UNAVAILABLE = 'automation_generation_unavailable';

const AUTOMATION_GENERATION_UNAVAILABLE_MESSAGE =
  'First-party automation generation is not available yet. Drafts, publish, and manual runs remain first-party scoped.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getAutomationChatErrorMessage(message: string) {
  const parsed = parseJsonObject(message);
  if (parsed?.error === AUTOMATION_GENERATION_UNAVAILABLE) {
    return typeof parsed.message === 'string'
      ? parsed.message
      : AUTOMATION_GENERATION_UNAVAILABLE_MESSAGE;
  }

  if (message.includes(AUTOMATION_GENERATION_UNAVAILABLE)) {
    return AUTOMATION_GENERATION_UNAVAILABLE_MESSAGE;
  }

  return `Communication error with the AI: ${message}`;
}

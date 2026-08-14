export const AUTOMATION_AGENT_MAX_STEPS = 30;

interface AutomationAgentStepHistory {
  steps: readonly unknown[];
}

export function shouldStopAutomationAgent({ steps }: AutomationAgentStepHistory): boolean {
  return steps.length >= AUTOMATION_AGENT_MAX_STEPS;
}

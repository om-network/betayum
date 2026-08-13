import { describe, expect, it } from 'vitest';
import { AUTOMATION_AGENT_MAX_STEPS, shouldStopAutomationAgent } from './agent-lifecycle';

describe('automation agent lifecycle', () => {
  it('continues past the previous ten-step limit', () => {
    const completedSteps = Array.from({ length: 10 }, () => ({}));

    expect(shouldStopAutomationAgent({ steps: completedSteps })).toBe(false);
  });

  it('retains a finite guard against runaway tool loops', () => {
    const completedSteps = Array.from({ length: AUTOMATION_AGENT_MAX_STEPS }, () => ({}));

    expect(shouldStopAutomationAgent({ steps: completedSteps })).toBe(true);
  });
});

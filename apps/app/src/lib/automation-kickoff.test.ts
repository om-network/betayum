import {
  AUTOMATION_KICKOFF,
  LEGACY_AUTOMATION_KICKOFF,
  normalizeAutomationKickoffMessages,
} from './automation-kickoff';

describe('automation kickoff', () => {
  it('collects evidence without remediation and records any required user action', () => {
    expect(AUTOMATION_KICKOFF).toContain('Collect evidence only');
    expect(AUTOMATION_KICKOFF).toContain('do not fix, configure, implement, remediate');
    expect(AUTOMATION_KICKOFF).toContain('report the observed gap');
    expect(AUTOMATION_KICKOFF).toContain('finalizeAutomationReview');
    expect(AUTOMATION_KICKOFF).toContain('In Review');
    expect(AUTOMATION_KICKOFF).toContain('Delegate to Codex');
    expect(AUTOMATION_KICKOFF).not.toContain('Build the automation script');
  });

  it('normalizes the legacy script instruction in saved chat history', () => {
    const [message] = normalizeAutomationKickoffMessages([
      {
        id: 'message_1',
        role: 'user',
        parts: [{ type: 'text', text: LEGACY_AUTOMATION_KICKOFF }],
      },
    ]);

    expect(message?.parts).toEqual([{ type: 'text', text: AUTOMATION_KICKOFF }]);
  });
});

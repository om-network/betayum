import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './system-prompt';

describe('buildSystemPrompt', () => {
  it('separates fact collection in scripts from evaluation by the LLM', () => {
    const prompt = buildSystemPrompt(
      { title: 'Access Review Log', description: 'Review access for least privilege' },
      { projectIds: ['project-1'] },
      true,
      null,
    );

    expect(prompt).toContain('FACT COLLECTION AND EVALUATION BOUNDARY');
    expect(prompt).toContain('Scripts retrieve facts only');
    expect(prompt).toContain('Never have the script decide');
    expect(prompt).toContain('Retain, Remove, Modify, Approve, Deny, Pass, Fail');
    expect(prompt).toContain('The LLM must read the complete script output');
    expect(prompt).toContain('Only the LLM evaluates the facts');
  });

  it('programs the agent to upload the edited sheet to task attachments', () => {
    const prompt = buildSystemPrompt(
      { title: 'Access Review Log', description: 'Populate the template' },
      null,
      true,
      null,
    );

    expect(prompt).toContain('Populate structured files only when');
    expect(prompt).toContain('immediately uploads a CSV snapshot to the task');
    expect(prompt).toContain('GCS-backed attachments');
    expect(prompt).toContain('check attachedToTask');
  });

  it('programs the LLM to finalize every outcome in review with remarks', () => {
    const prompt = buildSystemPrompt(
      { title: 'Access Review Log', description: 'Collect access evidence' },
      null,
      false,
      null,
    );

    expect(prompt).toContain('finalizeAutomationReview');
    expect(prompt).toContain('AUTOMATION REVIEW OUTCOME');
    expect(prompt).toContain('Only the LLM chooses the automation outcome');
    expect(prompt).toContain('Scripts must never choose or emit the outcome or task status');
    expect(prompt).toContain('Every outcome submits the task as in_review');
    expect(prompt).toContain(
      'including when the evidence demonstrates that the control does not pass',
    );
    expect(prompt).toContain('full reviewer remarks');
  });

  it('instructs the agent to use Codex for screenshot evidence', () => {
    const prompt = buildSystemPrompt(
      {
        title: 'Console configuration evidence',
        description: 'Capture the configured settings from the admin console',
      },
      null,
      false,
      null,
    );

    expect(prompt).toContain('CODEX BROWSER DELEGATION (available)');
    expect(prompt).toContain('delegateBrowserTask');
    expect(prompt).toContain("organization's existing authenticated Chrome session");
    expect(prompt).toContain('precise evidenceDescription');
    expect(prompt).toContain('only final, reviewer-ready evidence');
    expect(prompt).toContain('assess every final screenshot for annotation');
    expect(prompt).toContain('use image-annotations for fields, controls, values');
    expect(prompt).toContain('blocker summary without images');
    expect(prompt).toContain('up to 10 PNG/JPEG screenshots');
    expect(prompt).toContain('runs durably for up to 30 minutes');
    expect(prompt).toContain('verify the returned attachment IDs');
    expect(prompt).toContain(
      'Use scripts for API fact collection and Codex for screenshot evidence',
    );
    expect(prompt).toContain('Screenshot-only');
    expect(prompt).toContain('Use delegateBrowserTask only');
    expect(prompt).toContain('must not produce a Python script');
    expect(prompt).toContain('A Google Workspace connection alone is not a reason');
    expect(prompt).toContain('Never call it for screenshot-only work');
  });

  it('requires missing material inputs before Codex delegation or API writing', () => {
    const prompt = buildSystemPrompt(
      { title: 'Collect evidence', description: 'Collect configuration evidence' },
      null,
      false,
      null,
    );

    expect(prompt).toContain('REQUIRED INPUT CHECK');
    expect(prompt).toContain('Before delegating to Codex or writing an API script');
    expect(prompt).toContain('Do not guess project IDs, organization IDs, URLs');
    expect(prompt).toContain('Before promptForInfo or promptForSecret');
    expect(prompt).toContain('do not delegate, write, save, or run');
    expect(prompt).not.toContain('Never ask clarifying questions');
  });

  it('attempts startup and records genuine blockers', () => {
    const prompt = buildSystemPrompt({ title: 'Evidence task' });

    expect(prompt).toContain('attempt collection with the available integrations');
    expect(prompt).toContain(
      'Before promptForInfo or promptForSecret, call finalizeAutomationReview',
    );
    expect(prompt).toContain('Do not ask the user to classify the evidence');
  });

  it('uses the sole configured platform without asking the user to choose one', () => {
    const prompt = buildSystemPrompt(
      { title: 'GCP environment evidence' },
      { projectIds: [], apiAvailable: false },
      false,
      null,
    );

    expect(prompt).toContain('Configured platforms: GCP');
    expect(prompt).toContain('use GCP automatically');
    expect(prompt).toContain('Do not ask which platform to use');
    expect(prompt).toContain('Do not offer unconfigured platforms such as AWS, Azure');
    expect(prompt).toContain('GCP API connection is currently unavailable');
    expect(prompt).toContain('use the authenticated browser session');
  });

  it('only asks about platform choice when configured platforms genuinely conflict', () => {
    const prompt = buildSystemPrompt(
      { title: 'Collect platform evidence' },
      { projectIds: ['project-1'], apiAvailable: true },
      false,
      { orgs: ['example'], apiAvailable: true },
    );

    expect(prompt).toContain('Configured platforms: GCP, GitHub');
    expect(prompt).toContain('infer the target from the task');
    expect(prompt).toContain('Ask only when multiple configured platforms remain plausible');
  });

  it('limits automation to evidence collection and gap reporting', () => {
    const prompt = buildSystemPrompt({
      title: 'Firewall evidence',
      description: 'Verify the production firewall configuration',
    });

    expect(prompt).toContain('EVIDENCE-ONLY ROLE');
    expect(prompt).toContain('Observe and collect evidence; never remediate');
    expect(prompt).toContain('Do not change cloud settings');
    expect(prompt).toContain('Do not edit application code');
    expect(prompt).toContain('report what evidence is missing');
    expect(prompt).toContain('Never attempt to make the control pass');
  });

  it('provides known integration context and forbids asking for known values', () => {
    const prompt = buildSystemPrompt(
      { title: 'Collect evidence' },
      { projectIds: ['project-1'], apiAvailable: true },
      false,
      null,
      {
        connections: [
          {
            provider: 'Google Cloud Platform',
            status: 'active',
            knownValues: ['project_ids: project-1'],
          },
        ],
      },
    );

    expect(prompt).toContain('ORGANIZATION INTEGRATION CONTEXT');
    expect(prompt).toContain('Google Cloud Platform (active)');
    expect(prompt).toContain('project_ids: project-1');
    expect(prompt).toContain('Do not ask for information listed here');
  });

  it('uses task-scoped context and existing attachments before recollecting evidence', () => {
    const prompt = buildSystemPrompt(
      { title: 'Collect access evidence' },
      null,
      false,
      null,
      undefined,
      {
        task: {
          id: 'tsk_1',
          title: 'Collect access evidence',
          description: 'Review repository access',
          status: 'todo',
          department: null,
          frequency: 'quarterly',
          reviewDate: null,
          lastCompletedAt: null,
          assignee: null,
          approver: null,
          organization: { name: 'Example', website: null },
          controls: [],
          vendors: [],
          risks: [],
          findings: [],
          evidenceAutomations: [],
        },
        attachments: [
          {
            id: 'att_1',
            name: 'access-review.pdf',
            type: 'document',
            mimeType: 'application/pdf',
            sizeBytes: 1234,
            createdAt: '2026-08-01T00:00:00.000Z',
            sourceRunId: null,
          },
        ],
        browserVm: null,
      },
    );

    expect(prompt).toContain('TASK-SCOPED BETAYUM CONTEXT');
    expect(prompt).toContain('access-review.pdf');
    expect(prompt).toContain('Use readTaskAttachment');
    expect(prompt).toContain('Collect only evidence that is missing, stale');
    expect(prompt).toContain('Do not ask for information already present');
  });
});

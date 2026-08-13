const mockDb = {
  codexAutomationRun: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  evidenceAutomation: {
    findFirst: jest.fn(),
  },
};
const completeToken = jest.fn();
const promoteScreenshots = jest.fn();
const expireStaleRuns = jest.fn();
const reconcileAutomation = jest.fn();

jest.mock('@db', () => ({
  CodexAutomationRunStatus: {
    completed: 'completed',
    dispatched: 'dispatched',
    failed: 'failed',
    pending: 'pending',
    promoted: 'promoted',
    promoting: 'promoting',
    timed_out: 'timed_out',
  },
  db: mockDb,
}));
jest.mock('@trigger.dev/sdk', () => ({
  wait: { completeToken },
}));
jest.mock('../../app/object-storage', () => ({
  objectStorage: {},
}));
jest.mock('./codex-automation-promotion', () => ({
  promoteCodexAutomationScreenshots: promoteScreenshots,
}));
jest.mock('./codex-automation-reconciliation', () => ({
  expireStaleCodexAutomationRuns: expireStaleRuns,
  reconcileCodexAutomation: reconcileAutomation,
}));

import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { BrowserVmLifecycleService } from '../../integration-browser/browser-vm-lifecycle.service';
import type { CodexSshService } from '../../integration-browser/codex-ssh.service';
import { CodexAutomationService } from './codex-automation.service';

const TOKEN = 'valid_capability';
const RUN_ID = 'car_test';
const SCREENSHOT = {
  checksumSha256: 'a'.repeat(64),
  fileName: 'evidence.png',
  mimeType: 'image/png',
  sizeBytes: 100,
  stagedObjectKey: 'org_test/automation-runs/car_test/screenshots/evidence.png',
};
const REFERENCE = {
  checksumSha256: SCREENSHOT.checksumSha256,
  mimeType: SCREENSHOT.mimeType,
  objectKey: SCREENSHOT.stagedObjectKey,
  sizeBytes: SCREENSHOT.sizeBytes,
};

function buildRun(status = 'dispatched', summary: string | null = null) {
  return {
    capabilityExpiresAt: new Date(Date.now() + 60_000),
    capabilityTokenHash: createHash('sha256').update(TOKEN).digest('hex'),
    id: RUN_ID,
    organizationId: 'org_test',
    screenshots: [SCREENSHOT],
    status,
    summary,
    triggerWaitpointId: 'waitpoint_1',
  };
}

describe(CodexAutomationService.name, () => {
  const service = new CodexAutomationService(
    {} as unknown as BrowserVmLifecycleService,
    {} as unknown as CodexSshService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.codexAutomationRun.updateMany.mockResolvedValue({ count: 1 });
    completeToken.mockResolvedValue(undefined);
    promoteScreenshots.mockResolvedValue({
      attachmentIds: ['att_1'],
      screenshots: [],
      summary: 'Captured evidence',
    });
    expireStaleRuns.mockResolvedValue(0);
    reconcileAutomation.mockResolvedValue(undefined);
  });

  it('fails a run before dispatch when Codex is not logged in', async () => {
    const browserVm = {
      id: 'bvm_1',
      instanceName: 'browser-vm-1',
      internalIp: '10.80.0.4',
    };
    const browserVms = {
      ensureVm: jest.fn().mockResolvedValue(browserVm),
    };
    const codexSsh = {
      getStatus: jest.fn().mockResolvedValue(false),
      runAutomation: jest.fn(),
    };
    const dispatchService = new CodexAutomationService(
      browserVms as unknown as BrowserVmLifecycleService,
      codexSsh as unknown as CodexSshService,
    );
    mockDb.evidenceAutomation.findFirst.mockResolvedValue({ id: 'aut_1' });
    mockDb.codexAutomationRun.create.mockResolvedValue({
      id: RUN_ID,
      status: 'pending',
    });
    mockDb.codexAutomationRun.update.mockResolvedValue({});
    process.env.CODEX_AUTOMATION_API_BASE_URL = 'http://localhost:3333';

    await expect(
      dispatchService.createRun({
        automationId: 'aut_1',
        dto: {
          evidenceDescription: 'Dashboard screenshot',
          prompt: 'Open the dashboard',
        },
        organizationId: 'org_test',
        taskId: 'tsk_1',
      }),
    ).resolves.toEqual({ runId: RUN_ID, status: 'pending' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(codexSsh.runAutomation).not.toHaveBeenCalled();
    expect(mockDb.codexAutomationRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        completedAt: expect.any(Date),
        errorMessage: 'Codex is not logged in on the browser VM',
        status: 'failed',
      },
    });
    expect(reconcileAutomation).toHaveBeenCalledWith({
      automationId: 'aut_1',
      message: 'Codex is not logged in on the browser VM',
      runId: RUN_ID,
      successful: false,
    });
  });

  it('completes a run and resumes its Trigger waitpoint', async () => {
    mockDb.codexAutomationRun.findFirst.mockResolvedValue(buildRun());

    await expect(
      service.completeRun({
        authorization: `Bearer ${TOKEN}`,
        dto: { screenshots: [REFERENCE], summary: 'Captured evidence' },
        runId: RUN_ID,
      }),
    ).resolves.toEqual({ accepted: true });

    expect(mockDb.codexAutomationRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          summary: 'Captured evidence',
        }),
      }),
    );
    expect(completeToken).toHaveBeenCalledWith('waitpoint_1', {
      runId: RUN_ID,
      summary: 'Captured evidence',
    });
  });

  it('accepts an identical completion retry without another database update', async () => {
    mockDb.codexAutomationRun.findFirst.mockResolvedValue(
      buildRun('completed', 'Captured evidence'),
    );

    await expect(
      service.completeRun({
        authorization: `Bearer ${TOKEN}`,
        dto: { screenshots: [REFERENCE], summary: 'Captured evidence' },
        runId: RUN_ID,
      }),
    ).resolves.toEqual({ accepted: true });

    expect(mockDb.codexAutomationRun.updateMany).not.toHaveBeenCalled();
    expect(completeToken).toHaveBeenCalledTimes(1);
  });

  it('promotes screenshots directly when a local run has no waitpoint', async () => {
    mockDb.codexAutomationRun.findFirst.mockResolvedValue({
      ...buildRun(),
      triggerWaitpointId: null,
    });

    await expect(
      service.completeRun({
        authorization: `Bearer ${TOKEN}`,
        dto: { screenshots: [REFERENCE], summary: 'Captured evidence' },
        runId: RUN_ID,
      }),
    ).resolves.toEqual({
      accepted: true,
      output: {
        attachmentIds: ['att_1'],
        screenshots: [],
        summary: 'Captured evidence',
      },
    });

    expect(promoteScreenshots).toHaveBeenCalledWith({
      organizationId: 'org_test',
      runId: RUN_ID,
    });
    expect(completeToken).not.toHaveBeenCalled();
  });

  it('rejects a conflicting completion retry', async () => {
    mockDb.codexAutomationRun.findFirst.mockResolvedValue(
      buildRun('completed', 'Original summary'),
    );

    await expect(
      service.completeRun({
        authorization: `Bearer ${TOKEN}`,
        dto: { screenshots: [REFERENCE], summary: 'Different summary' },
        runId: RUN_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects screenshot metadata that differs from the staged upload', async () => {
    mockDb.codexAutomationRun.findFirst.mockResolvedValue(buildRun());

    await expect(
      service.completeRun({
        authorization: `Bearer ${TOKEN}`,
        dto: {
          screenshots: [{ ...REFERENCE, checksumSha256: 'b'.repeat(64) }],
          summary: 'Captured evidence',
        },
        runId: RUN_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired capability', async () => {
    mockDb.codexAutomationRun.findFirst.mockResolvedValue({
      ...buildRun(),
      capabilityExpiresAt: new Date(Date.now() - 1),
    });

    await expect(
      service.completeRun({
        authorization: `Bearer ${TOKEN}`,
        dto: { screenshots: [REFERENCE], summary: 'Captured evidence' },
        runId: RUN_ID,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

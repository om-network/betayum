const mockDb = {
  $transaction: jest.fn(),
  codexTerminalSession: {
    update: jest.fn(),
  },
  organizationBrowserVm: {
    update: jest.fn(),
  },
};

jest.mock('@db', () => ({
  BrowserViewerSessionStatus: {
    provisioning: 'provisioning',
    ready: 'ready',
    active: 'active',
  },
  BrowserVmState: {
    provisioning: 'provisioning',
    starting: 'starting',
    running: 'running',
  },
  CodexTerminalSessionStatus: {
    provisioning: 'provisioning',
    ready: 'ready',
    active: 'active',
    completed: 'completed',
    cancelled: 'cancelled',
    expired: 'expired',
    failed: 'failed',
  },
  db: mockDb,
}));

import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BrowserVmLifecycleService } from './browser-vm-lifecycle.service';
import { CodexSshService } from './codex-ssh.service';
import { CodexTerminalService } from './codex-terminal.service';
import { GcpComputeService } from './gcp-compute.service';
import { IntegrationBrowserAccessService } from './integration-browser-access.service';

describe(CodexTerminalService.name, () => {
  const access = {
    claimCodexTerminalSession: jest.fn(),
    requireCodexTerminalSession: jest.fn(),
    requireBrowserConnection: jest.fn(),
  };
  const compute = {
    getInstance: jest.fn(),
    startInstance: jest.fn(),
  };
  const lifecycle = { ensureVm: jest.fn() };
  const ssh = {
    ensureConfigured: jest.fn(),
    getStatus: jest.fn(),
    logout: jest.fn(),
  };
  let service: CodexTerminalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CodexTerminalService,
        { provide: IntegrationBrowserAccessService, useValue: access },
        { provide: GcpComputeService, useValue: compute },
        { provide: CodexSshService, useValue: ssh },
        { provide: BrowserVmLifecycleService, useValue: lifecycle },
      ],
    }).compile();
    service = module.get(CodexTerminalService);
  });

  it('rejects a terminal lease held by another user', async () => {
    lifecycle.ensureVm.mockResolvedValue({ id: 'bvm_1' });
    access.claimCodexTerminalSession.mockResolvedValue({
      claimed: false,
      session: {
        id: 'cts_existing',
        userId: 'usr_other',
        connectionId: 'icn_1',
      },
    });

    await expect(
      service.createSession({
        connectionId: 'icn_1',
        organizationId: 'org_1',
        userId: 'usr_1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks the terminal ready after SSH is reachable', async () => {
    const browserVm = {
      id: 'bvm_1',
      state: 'starting',
      instanceName: 'betayum-browser-1',
    };
    const session = {
      id: 'cts_1',
      status: 'provisioning',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      errorMessage: null,
      browserVmId: 'bvm_1',
      browserVm,
    };
    access.requireCodexTerminalSession.mockResolvedValue(session);
    compute.getInstance.mockResolvedValue({
      id: 'instance-1',
      name: 'betayum-browser-1',
      status: 'RUNNING',
      internalIp: '10.80.0.4',
    });
    const runningVm = { ...browserVm, internalIp: '10.80.0.4' };
    mockDb.organizationBrowserVm.update.mockResolvedValue(runningVm);
    ssh.ensureConfigured.mockResolvedValue(runningVm);
    ssh.getStatus.mockResolvedValue(false);
    mockDb.codexTerminalSession.update.mockResolvedValue({
      ...session,
      status: 'ready',
    });

    await expect(
      service.reconcileSession({
        sessionId: 'cts_1',
        organizationId: 'org_1',
        userId: 'usr_1',
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'ready' }));
    expect(ssh.ensureConfigured).toHaveBeenCalledWith(runningVm);
  });

  it('logs Codex out and releases the organization lease', async () => {
    const browserVm = { id: 'bvm_1' };
    access.requireCodexTerminalSession.mockResolvedValue({
      id: 'cts_1',
      status: 'active',
      browserVmId: 'bvm_1',
      browserVm,
    });
    ssh.logout.mockResolvedValue(undefined);
    mockDb.organizationBrowserVm.update.mockResolvedValue({});
    mockDb.codexTerminalSession.update.mockResolvedValue({});
    mockDb.$transaction.mockResolvedValue([]);

    await service.logout({
      sessionId: 'cts_1',
      organizationId: 'org_1',
      userId: 'usr_1',
    });

    expect(ssh.logout).toHaveBeenCalledWith(browserVm);
    expect(mockDb.codexTerminalSession.update).toHaveBeenCalledWith({
      where: { id: 'cts_1' },
      data: { leaseKey: null, status: 'completed' },
    });
  });
});

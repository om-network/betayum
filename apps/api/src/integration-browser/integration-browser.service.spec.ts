const mockDb = {
  $transaction: jest.fn(),
  browserViewerSession: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  organizationBrowserVm: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@db', () => ({
  BrowserViewerSessionStatus: {
    provisioning: 'provisioning',
    ready: 'ready',
    active: 'active',
    completed: 'completed',
    cancelled: 'cancelled',
    expired: 'expired',
    failed: 'failed',
  },
  BrowserVmState: {
    starting: 'starting',
    running: 'running',
  },
  db: mockDb,
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BrowserVmLifecycleService } from './browser-vm-lifecycle.service';
import { GcpComputeService } from './gcp-compute.service';
import { IntegrationBrowserAccessService } from './integration-browser-access.service';
import { IntegrationBrowserService } from './integration-browser.service';

describe(IntegrationBrowserService.name, () => {
  const access = {
    claimViewerSession: jest.fn(),
    requireGcpConnection: jest.fn(),
    requireViewerSession: jest.fn(),
  };
  const compute = {
    getInstance: jest.fn(),
    isViewerReady: jest.fn(),
    startInstance: jest.fn(),
  };
  const lifecycle = { ensureVm: jest.fn() };
  let service: IntegrationBrowserService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        IntegrationBrowserService,
        { provide: IntegrationBrowserAccessService, useValue: access },
        { provide: GcpComputeService, useValue: compute },
        { provide: BrowserVmLifecycleService, useValue: lifecycle },
      ],
    }).compile();
    service = module.get(IntegrationBrowserService);
  });

  it('rejects a second viewer for the same organization', async () => {
    lifecycle.ensureVm.mockResolvedValue({ id: 'bvm_1' });
    access.claimViewerSession.mockResolvedValue({
      claimed: false,
      session: {
        id: 'bvs_existing',
        userId: 'usr_other',
        connectionId: 'icn_1',
      },
    });

    await expect(
      service.createViewerSession({
        connectionId: 'icn_1',
        organizationId: 'org_1',
        userId: 'usr_1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(lifecycle.ensureVm).toHaveBeenCalledWith('org_1');
  });

  it('marks a running and reachable VM ready', async () => {
    const session = {
      id: 'bvs_1',
      status: 'provisioning',
      expiresAt: new Date(Date.now() + 60_000),
      errorMessage: null,
      browserVmId: 'bvm_1',
      browserVm: {
        createdAt: new Date(),
        instanceName: 'betayum-browser-1',
      },
    };
    access.requireViewerSession.mockResolvedValue(session);
    compute.getInstance.mockResolvedValue({
      id: 'instance-1',
      name: 'betayum-browser-1',
      status: 'RUNNING',
      internalIp: '10.80.0.4',
    });
    compute.isViewerReady.mockResolvedValue(true);
    mockDb.browserViewerSession.update.mockResolvedValue({
      ...session,
      status: 'ready',
    });

    await expect(
      service.reconcileViewerSession({
        sessionId: 'bvs_1',
        organizationId: 'org_1',
        userId: 'usr_1',
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'ready' }));
  });

  it('does not complete an expired viewer session', async () => {
    access.requireViewerSession.mockResolvedValue({
      status: 'active',
      expiresAt: new Date(Date.now() - 1),
      browserVmId: 'bvm_1',
    });

    await expect(
      service.completeViewerSession({
        sessionId: 'bvs_1',
        organizationId: 'org_1',
        userId: 'usr_1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

const mockDb = {
  organizationBrowserVm: {
    update: jest.fn(),
  },
};

jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../secrets/encryption.util', () => ({
  decrypt: jest.fn(),
  encrypt: jest.fn(() => ({
    encrypted: 'encrypted-private-key',
    iv: 'iv',
    salt: 'salt',
    tag: 'tag',
  })),
}));

import { CodexSshService } from './codex-ssh.service';
import type { GcpComputeService } from './gcp-compute.service';

describe(CodexSshService.name, () => {
  const compute = {
    setMetadataItem: jest.fn(),
  };
  const service = new CodexSshService(compute as unknown as GcpComputeService);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.organizationBrowserVm.update.mockResolvedValue({});
    compute.setMetadataItem.mockResolvedValue('operation-1');
  });

  it('creates an encrypted organization key and publishes only its public key', async () => {
    const configured = await service.ensureConfigured({
      id: 'bvm_1',
      instanceName: 'betayum-browser-1',
      internalIp: '10.80.0.4',
      codexSshConfiguredAt: null,
      codexSshHostFingerprint: null,
      codexSshPrivateKeyEncrypted: null,
      codexSshPublicKey: null,
    });

    expect(configured.codexSshPublicKey).toMatch(
      /^ssh-ed25519 [A-Za-z0-9+/=]+ betayum-codex$/,
    );
    expect(mockDb.organizationBrowserVm.update).toHaveBeenCalledWith({
      where: { id: 'bvm_1' },
      data: expect.objectContaining({
        codexSshPrivateKeyEncrypted: {
          encrypted: 'encrypted-private-key',
          iv: 'iv',
          salt: 'salt',
          tag: 'tag',
        },
      }),
    });
    expect(compute.setMetadataItem).toHaveBeenCalledWith({
      instanceName: 'betayum-browser-1',
      key: 'betayum-codex-ssh-public-key',
      value: configured.codexSshPublicKey,
    });
    expect(compute.setMetadataItem.mock.calls[0]?.[0]).not.toHaveProperty(
      'privateKey',
    );
  });
});

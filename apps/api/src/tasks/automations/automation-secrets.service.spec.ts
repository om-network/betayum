import { NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { AutomationSecretsService } from './automation-secrets.service';

jest.mock('@db', () => ({
  db: {
    secret: {
      findMany: jest.fn(),
    },
  },
}));

const mockedDb = db as unknown as {
  secret: {
    findMany: jest.Mock;
  };
};

describe('AutomationSecretsService', () => {
  let service: AutomationSecretsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutomationSecretsService();
  });

  it('verifies secret references inside the current organization', async () => {
    mockedDb.secret.findMany.mockResolvedValue([
      { name: 'github-token', category: 'automation' },
    ] as never);

    await service.verifySecretRefs({
      organizationId: 'org_1',
      secretRefs: [{ name: 'github-token', category: 'automation' }],
    });

    expect(mockedDb.secret.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        OR: [{ name: 'github-token', category: 'automation' }],
      },
      select: {
        name: true,
        category: true,
      },
    });
  });

  it('rejects missing or cross-organization secret references', async () => {
    mockedDb.secret.findMany.mockResolvedValue([]);

    await expect(
      service.verifySecretRefs({
        organizationId: 'org_1',
        secretRefs: [{ name: 'other-token', category: 'automation' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

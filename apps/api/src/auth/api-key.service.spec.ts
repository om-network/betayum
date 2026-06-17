jest.mock('@trycompai/auth', () => ({
  statement: {
    organization: ['read', 'update', 'delete'],
    member: ['create', 'read', 'update', 'delete'],
    invitation: ['create', 'read', 'delete'],
    team: ['create', 'read', 'update', 'delete'],
    control: ['create', 'read', 'update', 'delete'],
    evidence: ['create', 'read', 'update', 'delete'],
    policy: ['create', 'read', 'update', 'delete'],
    risk: ['create', 'read', 'update', 'delete'],
    vendor: ['create', 'read', 'update', 'delete'],
    task: ['create', 'read', 'update', 'delete'],
    framework: ['create', 'read', 'update', 'delete'],
    audit: ['create', 'read', 'update'],
    finding: ['create', 'read', 'update', 'delete'],
    questionnaire: ['create', 'read', 'update', 'delete'],
    integration: ['create', 'read', 'update', 'delete'],
    apiKey: ['create', 'read', 'delete'],
    app: ['read'],
    trust: ['read', 'update'],
    pentest: ['create', 'read', 'delete'],
    training: ['read', 'update'],
  },
}));

const mockDb = {
  apiKey: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('@db', () => ({ db: mockDb }));

import { webcrypto } from 'node:crypto';
import { ApiKeyService } from './api-key.service';

async function sha256Hex(value: string): Promise<string> {
  const input = new TextEncoder().encode(value);
  const digest = await webcrypto.subtle.digest('SHA-256', input);
  return Buffer.from(digest).toString('hex');
}

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(() => {
    service = new ApiKeyService();
    Object.values(mockDb.apiKey).forEach((mock) => mock.mockReset());
  });

  describe('getAvailableScopes', () => {
    let scopes: string[];

    beforeEach(() => {
      scopes = service.getAvailableScopes();
    });

    it('should not include any invitation:* scopes', () => {
      const matches = scopes.filter((s) => s.startsWith('invitation:'));
      expect(matches).toEqual([]);
    });

    it('should not include any team:* scopes', () => {
      const matches = scopes.filter((s) => s.startsWith('team:'));
      expect(matches).toEqual([]);
    });

    it('should not include any compliance:* scopes', () => {
      const matches = scopes.filter((s) => s.startsWith('compliance:'));
      expect(matches).toEqual([]);
    });

    it('should include expected public resources', () => {
      const expected = [
        'risk',
        'vendor',
        'task',
        'control',
        'policy',
        'evidence',
        'framework',
        'audit',
        'finding',
        'questionnaire',
        'integration',
        'apiKey',
        'pentest',
      ];
      for (const resource of expected) {
        const matching = scopes.filter((s) => s.startsWith(`${resource}:`));
        expect(matching.length).toBeGreaterThan(0);
      }
    });

    it('should return scopes in resource:action format', () => {
      for (const scope of scopes) {
        expect(scope).toMatch(/^[a-zA-Z]+:[a-zA-Z]+$/);
      }
    });

    it('should not return an empty array', () => {
      expect(scopes.length).toBeGreaterThan(0);
    });
  });

  describe('api key hashing', () => {
    it('stores newly created API keys with scrypt and validates them', async () => {
      let persistedData: {
        key: string;
        keyPrefix: string;
        salt: string;
        organizationId: string;
        scopes: string[];
      } | null = null;

      mockDb.apiKey.create.mockImplementation(
        async ({
          data,
        }: {
          data: {
            key: string;
            keyPrefix: string;
            salt: string;
            organizationId: string;
            scopes: string[];
          };
        }) => {
          persistedData = data;
          return {
            id: 'apk_1',
            name: 'CI key',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            expiresAt: null,
          };
        },
      );

      const created = await service.create('org_1', 'CI key', 'never', [
        'risk:read',
      ]);

      expect(persistedData).not.toBeNull();
      expect(persistedData?.key).toMatch(/^scrypt:v1:[a-f0-9]{64}$/);
      expect(persistedData?.salt).toMatch(/^[a-f0-9]{32}$/);
      expect(created.key).toMatch(/^comp_[a-f0-9]{64}$/);

      mockDb.apiKey.findMany.mockResolvedValueOnce([
        {
          id: 'apk_1',
          name: 'CI key',
          key: persistedData?.key,
          salt: persistedData?.salt,
          organizationId: 'org_1',
          scopes: ['risk:read'],
        },
      ]);
      mockDb.apiKey.update.mockResolvedValueOnce({});

      await expect(service.validateApiKey(created.key)).resolves.toEqual({
        apiKeyId: 'apk_1',
        apiKeyName: 'CI key',
        organizationId: 'org_1',
        scopes: ['risk:read'],
      });
      expect(mockDb.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'apk_1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('continues to validate salted legacy SHA-256 hashes', async () => {
      const apiKey = 'comp_1234567890abcdef';
      const salt = 'aabbccddeeff00112233445566778899';
      const legacyHash = await sha256Hex(apiKey + salt);

      mockDb.apiKey.findMany.mockResolvedValueOnce([
        {
          id: 'apk_legacy',
          name: 'Legacy key',
          key: legacyHash,
          salt,
          organizationId: 'org_legacy',
          scopes: ['task:read'],
        },
      ]);
      mockDb.apiKey.update.mockResolvedValueOnce({});

      await expect(service.validateApiKey(apiKey)).resolves.toEqual({
        apiKeyId: 'apk_legacy',
        apiKeyName: 'Legacy key',
        organizationId: 'org_legacy',
        scopes: ['task:read'],
      });
    });

    it('limits non-prefixed API keys to legacy records without scrypt verification', async () => {
      const apiKey = 'legacy-api-key';
      const legacyHash = await sha256Hex(apiKey);

      mockDb.apiKey.findMany.mockResolvedValueOnce([
        {
          id: 'apk_legacy',
          name: 'Legacy key',
          key: legacyHash,
          salt: null,
          organizationId: 'org_legacy',
          scopes: ['task:read'],
        },
      ]);
      mockDb.apiKey.update.mockResolvedValueOnce({});

      await expect(service.validateApiKey(apiKey)).resolves.toEqual({
        apiKeyId: 'apk_legacy',
        apiKeyName: 'Legacy key',
        organizationId: 'org_legacy',
        scopes: ['task:read'],
      });

      expect(mockDb.apiKey.findMany).toHaveBeenCalledTimes(1);
      expect(mockDb.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            keyPrefix: null,
          }),
        }),
      );
      expect(mockDb.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'apk_legacy' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });
});

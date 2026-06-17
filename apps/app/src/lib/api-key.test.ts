import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    apiKey: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@db/server', () => ({ db: dbMock }));

import { hashApiKey, validateApiKeyValue } from './api-key';

async function sha256Hex(value: string): Promise<string> {
  const input = new TextEncoder().encode(value);
  const digest = await webcrypto.subtle.digest('SHA-256', input);
  return Buffer.from(digest).toString('hex');
}

describe('api-key hashing', () => {
  beforeEach(() => {
    dbMock.apiKey.findMany.mockReset();
    dbMock.apiKey.update.mockReset();
  });

  it('hashes API keys with scrypt and the current version prefix', () => {
    const hash = hashApiKey('comp_1234567890abcdef', 'aabbccddeeff00112233445566778899');

    expect(hash).toMatch(/^scrypt:v1:[a-f0-9]{64}$/);
  });

  it('validates scrypt API key records using a timing-safe comparison', async () => {
    const apiKey = 'comp_1234567890abcdef';
    const salt = 'aabbccddeeff00112233445566778899';

    dbMock.apiKey.findMany.mockResolvedValueOnce([
      {
        id: 'apk_1',
        key: hashApiKey(apiKey, salt),
        salt,
        organizationId: 'org_1',
      },
    ]);
    dbMock.apiKey.update.mockResolvedValueOnce({});

    await expect(validateApiKeyValue(apiKey)).resolves.toBe('org_1');
    expect(dbMock.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'apk_1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('continues to validate salted legacy SHA-256 API key records', async () => {
    const apiKey = 'comp_1234567890abcdef';
    const salt = 'aabbccddeeff00112233445566778899';
    const legacyHash = await sha256Hex(apiKey + salt);

    dbMock.apiKey.findMany.mockResolvedValueOnce([
      {
        id: 'apk_legacy',
        key: legacyHash,
        salt,
        organizationId: 'org_legacy',
      },
    ]);
    dbMock.apiKey.update.mockResolvedValueOnce({});

    await expect(validateApiKeyValue(apiKey)).resolves.toBe('org_legacy');
  });

  it('limits non-prefixed API keys to legacy records without scrypt verification', async () => {
    const apiKey = 'legacy-api-key';
    const legacyHash = await sha256Hex(apiKey);

    dbMock.apiKey.findMany.mockResolvedValueOnce([
      {
        id: 'apk_legacy',
        key: legacyHash,
        salt: null,
        organizationId: 'org_legacy',
      },
    ]);
    dbMock.apiKey.update.mockResolvedValueOnce({});

    await expect(validateApiKeyValue(apiKey)).resolves.toBe('org_legacy');

    expect(dbMock.apiKey.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          keyPrefix: null,
        }),
      }),
    );
    expect(dbMock.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'apk_legacy' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });
});

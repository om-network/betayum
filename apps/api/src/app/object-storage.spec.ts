import type { GetSignedUrlConfig } from '@google-cloud/storage';
import { Readable } from 'node:stream';

describe('object storage configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.APP_OBJECT_STORAGE_BUCKET;
    delete process.env.APP_GCS_BUCKET_NAME;
    delete process.env.APP_AWS_BUCKET_NAME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses the shared app-data bucket and org prefix for object locations', () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    const { resolveObjectLocation } = require('./object-storage') as typeof import('./object-storage');

    expect(
      resolveObjectLocation({
        organizationId: 'org_123',
        key: 'attachments/task_1/evidence.pdf',
      }),
    ).toEqual({
      bucketName: 'betayum-app-data',
      key: 'org_123/attachments/task_1/evidence.pdf',
    });
  });

  it('rejects object keys outside the requested organization prefix', () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    const { resolveObjectLocation } = require('./object-storage') as typeof import('./object-storage');

    expect(() =>
      resolveObjectLocation({
        organizationId: 'org_123',
        key: 'org_456/attachments/evidence.pdf',
      }),
    ).toThrow('Object key must be scoped to organization org_123');
  });

  it('rejects malformed object keys', () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    const { validateObjectKey } = require('./object-storage') as typeof import('./object-storage');

    expect(() => validateObjectKey('../secret.pdf')).toThrow(
      'Path traversal detected',
    );
    expect(() =>
      validateObjectKey('https://storage.googleapis.com/b/k'),
    ).toThrow('Object key must not be a URL');
    expect(() => validateObjectKey('')).toThrow('Object key cannot be empty');
  });

  it('uses the resolved GCS bucket and key for object operations', async () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    const { GcsObjectStorage } = require('./object-storage') as typeof import('./object-storage');
    const fakeFile = new FakeStorageFile();
    const fakeStorage = new FakeStorage(fakeFile);
    const objectStorage = new GcsObjectStorage(fakeStorage);

    await expect(
      objectStorage.uploadObject({
        organizationId: 'org_123',
        key: 'attachments/evidence.pdf',
        body: Buffer.from('evidence'),
        contentType: 'application/pdf',
      }),
    ).resolves.toEqual({
      bucketName: 'betayum-app-data',
      key: 'org_123/attachments/evidence.pdf',
    });

    expect(fakeStorage.bucketName).toBe('betayum-app-data');
    expect(fakeFile.key).toBe('org_123/attachments/evidence.pdf');
    expect(fakeFile.savedBody?.toString()).toBe('evidence');
    expect(fakeFile.savedContentType).toBe('application/pdf');

    await expect(
      objectStorage.getSignedObjectUrl({
        organizationId: 'org_123',
        key: 'attachments/evidence.pdf',
        action: 'read',
        expiresInSeconds: 60,
      }),
    ).resolves.toBe('https://signed.example.com/object');

    expect(fakeFile.signedAction).toBe('read');
    expect(fakeFile.signedVersion).toBe('v4');

    await expect(
      objectStorage.deleteObject({
        organizationId: 'org_123',
        key: 'attachments/missing.pdf',
      }),
    ).resolves.toBeUndefined();
  });
});

class FakeStorage {
  bucketName: string | null = null;

  constructor(private readonly fakeFile: FakeStorageFile) {}

  bucket(name: string): FakeBucket {
    this.bucketName = name;
    return new FakeBucket(this.fakeFile);
  }
}

class FakeBucket {
  constructor(private readonly fakeFile: FakeStorageFile) {}

  file(key: string): FakeStorageFile {
    this.fakeFile.key = key;
    return this.fakeFile;
  }
}

class FakeStorageFile {
  key: string | null = null;
  savedBody: Buffer | null = null;
  savedContentType: string | null = null;
  signedAction: string | null = null;
  signedVersion: string | null = null;

  async save(
    body: Buffer | string | Uint8Array,
    options: { metadata?: { contentType?: string } },
  ): Promise<void> {
    this.savedBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    this.savedContentType = options.metadata?.contentType ?? null;
  }

  createReadStream(): Readable {
    return Readable.from(['object']);
  }

  async delete(): Promise<void> {
    const error = new Error('missing') as Error & { code: number };
    error.code = 404;
    throw error;
  }

  async getSignedUrl(config: GetSignedUrlConfig): Promise<[string]> {
    this.signedAction = config.action;
    this.signedVersion = config.version ?? null;
    return ['https://signed.example.com/object'];
  }
}

import type { GetSignedUrlConfig, Storage } from '@google-cloud/storage';
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

    const { resolveObjectLocation } =
      require('./object-storage') as typeof import('./object-storage');

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

    const { resolveObjectLocation } =
      require('./object-storage') as typeof import('./object-storage');

    expect(() =>
      resolveObjectLocation({
        organizationId: 'org_123',
        key: 'org_456/attachments/evidence.pdf',
      }),
    ).toThrow('Object key must be scoped to organization org_123');
  });

  it('does not treat legacy AWS bucket variables as GCS configuration', () => {
    process.env.APP_AWS_BUCKET_NAME = 'legacy-aws-bucket';

    const { resolveObjectLocation } =
      require('./object-storage') as typeof import('./object-storage');

    expect(() =>
      resolveObjectLocation({
        organizationId: 'org_123',
        key: 'attachments/evidence.pdf',
      }),
    ).toThrow('Object storage bucket is not configured');
  });

  it('rejects malformed object keys', () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    const { validateObjectKey } =
      require('./object-storage') as typeof import('./object-storage');

    expect(() => validateObjectKey('../secret.pdf')).toThrow(
      'Path traversal detected',
    );
    expect(() =>
      validateObjectKey('https://storage.googleapis.com/b/k'),
    ).toThrow('Object key must not be a URL');
    expect(() => validateObjectKey('')).toThrow('Object key cannot be empty');
  });

  it('rejects URL-shaped object keys without substring matching hostnames', () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    const { validateObjectKey } =
      require('./object-storage') as typeof import('./object-storage');

    expect(() =>
      validateObjectKey(
        'https://example.com/storage.googleapis.com/bucket/key.pdf',
      ),
    ).toThrow('Object key must not be a URL');
    expect(() =>
      validateObjectKey('storage.googleapis.com/bucket/key.pdf'),
    ).toThrow('Object key must not be a URL');
    expect(() => validateObjectKey('bucket.s3.amazonaws.com/key.pdf')).toThrow(
      'Object key must not be a URL',
    );
    expect(
      validateObjectKey('reports/storage.googleapis.com-reference.pdf'),
    ).toBe('reports/storage.googleapis.com-reference.pdf');
    expect(validateObjectKey('reports/amazonaws.com-reference.pdf')).toBe(
      'reports/amazonaws.com-reference.pdf',
    );
  });

  it('uses the resolved GCS bucket and key for object operations', async () => {
    process.env.APP_OBJECT_STORAGE_BUCKET = 'betayum-app-data';

    const { GcsObjectStorage } =
      require('./object-storage') as typeof import('./object-storage');
    const fakeFile = new FakeStorageFile();
    const fakeStorage = new FakeStorage(fakeFile);
    const objectStorage = new GcsObjectStorage(
      fakeStorage as unknown as Pick<Storage, 'bucket'>,
    );

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
      objectStorage.getObjectMetadata({
        organizationId: 'org_123',
        key: 'attachments/evidence.pdf',
      }),
    ).resolves.toEqual({
      contentLength: 8,
      contentType: 'application/pdf',
    });

    await expect(
      objectStorage.copyObject({
        organizationId: 'org_123',
        sourceKey: 'attachments/source.pdf',
        destinationKey: 'policies/destination.pdf',
      }),
    ).resolves.toEqual({
      bucketName: 'betayum-app-data',
      key: 'org_123/policies/destination.pdf',
    });

    expect(fakeStorage.copiedFromKey).toBe('org_123/attachments/source.pdf');
    expect(fakeStorage.copiedToKey).toBe('org_123/policies/destination.pdf');

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
  copiedFromKey: string | null = null;
  copiedToKey: string | null = null;
  private readonly files = new Map<string, FakeStorageFile>();

  constructor(private readonly fakeFile: FakeStorageFile) {}

  bucket(name: string): FakeBucket {
    this.bucketName = name;
    return new FakeBucket(this);
  }

  getFile(key: string): FakeStorageFile {
    const existingFile = this.files.get(key);
    if (existingFile) {
      return existingFile;
    }

    const file =
      this.files.size === 0 ? this.fakeFile : new FakeStorageFile(this);
    file.key = key;
    this.files.set(key, file);
    return file;
  }
}

class FakeBucket {
  constructor(private readonly fakeStorage: FakeStorage) {}

  file(key: string): FakeStorageFile {
    return this.fakeStorage.getFile(key);
  }
}

class FakeStorageFile {
  key: string | null = null;
  savedBody: Buffer | null = null;
  savedContentType: string | null = null;
  signedAction: string | null = null;
  signedVersion: string | null = null;
  constructor(private readonly fakeStorage?: FakeStorage) {}

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

  async copy(destination: FakeStorageFile): Promise<void> {
    if (this.fakeStorage) {
      this.fakeStorage.copiedFromKey = this.key;
      this.fakeStorage.copiedToKey = destination.key;
    }
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

  async getMetadata(): Promise<[{ size: string; contentType: string }]> {
    return [{ size: '8', contentType: 'application/pdf' }];
  }
}

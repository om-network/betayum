jest.mock('@/app/object-storage', () => {
  const actual = jest.requireActual('@/app/object-storage') as typeof import('@/app/object-storage');

  return {
    ...actual,
    objectStorage: {
      uploadObject: jest.fn(),
      deleteObject: jest.fn(),
      getSignedObjectUrl: jest.fn(),
    },
  };
});

import { objectStorage } from '@/app/object-storage';
import {
  deleteFromS3,
  generateDownloadUrl,
  generateViewUrl,
  uploadToS3,
} from './s3-operations';

const mockObjectStorage = objectStorage as jest.Mocked<typeof objectStorage>;

describe('knowledge base object storage operations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      APP_GCP_KNOWLEDGE_BASE_BUCKET: 'betayum-knowledge-base',
    };
    mockObjectStorage.uploadObject.mockResolvedValue({
      bucketName: 'betayum-knowledge-base',
      key: 'org_123/knowledge-base-documents/file.pdf',
    });
    mockObjectStorage.getSignedObjectUrl.mockResolvedValue(
      'https://signed.example.com/file',
    );
    mockObjectStorage.deleteObject.mockResolvedValue();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uploads knowledge base documents through object storage', async () => {
    const result = await uploadToS3(
      'org_123',
      'Knowledge Base.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4').toString('base64'),
    );

    expect(result).toEqual({
      s3Key: expect.stringMatching(
        /^org_123\/knowledge-base-documents\/\d+-[a-f0-9]+-Knowledge_Base\.pdf$/,
      ),
      fileSize: 8,
    });
    expect(mockObjectStorage.uploadObject).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: expect.stringMatching(
        /^org_123\/knowledge-base-documents\/\d+-[a-f0-9]+-Knowledge_Base\.pdf$/,
      ),
      bucketName: 'betayum-knowledge-base',
      body: Buffer.from('%PDF-1.4'),
      contentType: 'application/pdf',
      metadata: {
        originalFileName: 'Knowledge Base.pdf',
        organizationId: 'org_123',
      },
    });
  });

  it('generates signed URLs and deletes through object storage', async () => {
    await expect(
      generateDownloadUrl('org_123/knowledge-base-documents/doc.pdf', 'doc.pdf'),
    ).resolves.toEqual({ signedUrl: 'https://signed.example.com/file' });

    expect(mockObjectStorage.getSignedObjectUrl).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: 'org_123/knowledge-base-documents/doc.pdf',
      bucketName: 'betayum-knowledge-base',
      action: 'read',
      expiresInSeconds: 3600,
      responseContentDisposition: 'attachment; filename="doc.pdf"',
    });

    await expect(
      generateViewUrl(
        'org_123/knowledge-base-documents/doc.pdf',
        'doc.pdf',
        'application/pdf',
      ),
    ).resolves.toEqual({ signedUrl: 'https://signed.example.com/file' });

    expect(mockObjectStorage.getSignedObjectUrl).toHaveBeenLastCalledWith({
      organizationId: 'org_123',
      key: 'org_123/knowledge-base-documents/doc.pdf',
      bucketName: 'betayum-knowledge-base',
      action: 'read',
      expiresInSeconds: 3600,
      responseContentDisposition: 'inline; filename="doc.pdf"',
      responseContentType: 'application/pdf',
    });

    await expect(
      deleteFromS3('org_123/knowledge-base-documents/doc.pdf'),
    ).resolves.toBe(true);

    expect(mockObjectStorage.deleteObject).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: 'org_123/knowledge-base-documents/doc.pdf',
      bucketName: 'betayum-knowledge-base',
    });
  });
});

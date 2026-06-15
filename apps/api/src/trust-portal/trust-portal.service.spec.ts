jest.mock('@db', () => ({
  db: {
    trust: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    trustResource: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    trustDocument: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      update: jest.fn(),
    },
  },
  Prisma: {
    JsonNull: 'JsonNull',
  },
  TrustFramework: {
    iso_27001: 'iso_27001',
    iso_42001: 'iso_42001',
    gdpr: 'gdpr',
    hipaa: 'hipaa',
    soc2_type1: 'soc2_type1',
    soc2_type2: 'soc2_type2',
    pci_dss: 'pci_dss',
    nen_7510: 'nen_7510',
    iso_9001: 'iso_9001',
    soc3: 'soc3',
    pipeda: 'pipeda',
    ccpa: 'ccpa',
  },
}));

jest.mock('../app/object-storage', () => ({
  getOrgAssetsBucketName: jest.fn(() => 'org-assets'),
  objectStorage: {
    uploadObject: jest.fn(),
    deleteObject: jest.fn(),
    getSignedObjectUrl: jest.fn(),
  },
}));

import { db, TrustFramework } from '@db';
import { objectStorage } from '../app/object-storage';
import { TrustPortalService } from './trust-portal.service';

const mockDb = db as unknown as {
  trust: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  trustResource: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  trustDocument: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};
const mockObjectStorage = objectStorage as jest.Mocked<typeof objectStorage>;

describe('TrustPortalService object storage', () => {
  const service = new TrustPortalService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockObjectStorage.uploadObject.mockResolvedValue({
      bucketName: 'org-assets',
      key: 'org_123/resources/gdpr/cert.pdf',
    });
    mockObjectStorage.getSignedObjectUrl.mockResolvedValue(
      'https://signed.example.com/object',
    );
    mockObjectStorage.deleteObject.mockResolvedValue();
  });

  it('uploads compliance resources through object storage', async () => {
    mockDb.trust.findUnique.mockResolvedValue({
      gdpr_status: 'compliant',
      gdpr: true,
    });
    mockDb.trustResource.findUnique.mockResolvedValue(null);
    mockDb.trustResource.upsert.mockResolvedValue({
      framework: TrustFramework.gdpr,
      fileName: 'GDPR Certificate.pdf',
      fileSize: 8,
      updatedAt: new Date('2026-06-15T00:00:00.000Z'),
    });

    const result = await service.uploadComplianceResource({
      organizationId: 'org_123',
      framework: TrustFramework.gdpr,
      fileName: 'GDPR Certificate.pdf',
      fileType: 'application/pdf',
      fileData: Buffer.from('%PDF-1.4').toString('base64'),
    });

    expect(result.fileName).toBe('GDPR Certificate.pdf');
    expect(mockObjectStorage.uploadObject).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: expect.stringMatching(
        /^org_123\/resources\/gdpr\/\d+-GDPR_Certificate\.pdf$/,
      ),
      bucketName: 'org-assets',
      body: Buffer.from('%PDF-1.4'),
      contentType: 'application/pdf',
      metadata: {
        organizationId: 'org_123',
        framework: 'gdpr',
        originalFileName: 'GDPR Certificate.pdf',
      },
    });
  });

  it('signs trust document URLs through object storage', async () => {
    mockDb.trustDocument.findUnique.mockResolvedValue({
      s3Key: 'org_123/trust-documents/security.pdf',
      name: 'Security "Report".pdf',
      isActive: true,
    });

    const result = await service.getTrustDocumentUrl('doc_123', {
      organizationId: 'org_123',
    });

    expect(result).toEqual({
      signedUrl: 'https://signed.example.com/object',
      fileName: 'Security "Report".pdf',
    });
    expect(mockObjectStorage.getSignedObjectUrl).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: 'org_123/trust-documents/security.pdf',
      bucketName: 'org-assets',
      action: 'read',
      expiresInSeconds: 900,
      responseContentDisposition: 'attachment; filename="Security Report.pdf"',
    });
  });

  it('uploads favicons through object storage', async () => {
    mockDb.trust.findUnique.mockResolvedValue({ organizationId: 'org_123' });
    mockDb.trust.update.mockResolvedValue({});

    const result = await service.uploadFavicon('org_123', {
      fileName: 'favicon.png',
      fileType: 'image/png',
      fileData: Buffer.from('png').toString('base64'),
    });

    expect(result).toEqual({
      success: true,
      faviconUrl: 'https://signed.example.com/object',
    });
    expect(mockObjectStorage.uploadObject).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: expect.stringMatching(/^org_123\/trust\/favicon\/\d+-favicon\.png$/),
      bucketName: 'org-assets',
      body: Buffer.from('png'),
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });
  });
});

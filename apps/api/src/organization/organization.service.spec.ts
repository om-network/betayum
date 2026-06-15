const mockOrganizationUpdate = jest.fn();

jest.mock('@db', () => ({
  db: {
    organization: {
      update: mockOrganizationUpdate,
    },
  },
  Role: {
    owner: 'owner',
    admin: 'admin',
  },
}));

jest.mock('@trycompai/auth', () => ({
  allRoles: {},
}));

jest.mock('../app/object-storage', () => ({
  getOrgAssetsBucketName: jest.fn(() => 'org-assets-bucket'),
  objectStorage: {
    uploadObject: jest.fn(),
    getSignedObjectUrl: jest.fn(),
  },
}));

import { BadRequestException } from '@nestjs/common';
import { objectStorage } from '../app/object-storage';
import { OrganizationService } from './organization.service';

const mockObjectStorage = objectStorage as jest.Mocked<typeof objectStorage>;

describe('OrganizationService object storage', () => {
  const service = new OrganizationService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockObjectStorage.getSignedObjectUrl.mockResolvedValue(
      'https://signed.example.com/logo.png',
    );
    mockObjectStorage.uploadObject.mockResolvedValue({
      bucketName: 'betayum-app-data',
      key: 'org_123/logo/123-logo.png',
    });
    mockOrganizationUpdate.mockResolvedValue({
      id: 'org_123',
      logo: 'org_123/logo/123-logo.png',
    });
  });

  it('generates organization logo signed URLs through object storage', async () => {
    const url = await service.getLogoSignedUrl('org_123/logo/logo.png');

    expect(url).toBe('https://signed.example.com/logo.png');
    expect(mockObjectStorage.getSignedObjectUrl).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: 'org_123/logo/logo.png',
      bucketName: 'org-assets-bucket',
      action: 'read',
      expiresInSeconds: 3600,
    });
  });

  it('uploads logos through object storage and stores the object key', async () => {
    const result = await service.uploadLogo(
      'org_123',
      'Company Logo.png',
      'image/png',
      Buffer.from('fake-png').toString('base64'),
    );

    expect(mockObjectStorage.uploadObject).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: expect.stringMatching(/^org_123\/logo\/\d+-Company_Logo\.png$/),
      bucketName: 'org-assets-bucket',
      body: Buffer.from('fake-png'),
      contentType: 'image/png',
    });
    expect(mockOrganizationUpdate).toHaveBeenCalledWith({
      where: { id: 'org_123' },
      data: {
        logo: expect.stringMatching(/^org_123\/logo\/\d+-Company_Logo\.png$/),
      },
    });
    expect(result).toEqual({ logoUrl: 'https://signed.example.com/logo.png' });
  });

  it('rejects non-image logo uploads before storage', async () => {
    await expect(
      service.uploadLogo(
        'org_123',
        'logo.pdf',
        'application/pdf',
        Buffer.from('fake-pdf').toString('base64'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockObjectStorage.uploadObject).not.toHaveBeenCalled();
  });
});

import { Readable } from 'node:stream';
import type { ObjectStorage } from '../app/object-storage';
import { AttachmentsService } from './attachments.service';

jest.mock('@db', () => ({
  AttachmentType: {
    image: 'image',
    video: 'video',
    audio: 'audio',
    document: 'document',
    other: 'other',
  },
  db: {
    attachment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../utils/file-type-validation', () => ({
  validateFileContent: jest.fn(),
}));

describe('AttachmentsService object storage behavior', () => {
  const mockDb = jest.requireMock('@db').db as {
    attachment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
  };
  const objectStorage: jest.Mocked<ObjectStorage> = {
    uploadObject: jest.fn(),
    streamObject: jest.fn(),
    copyObject: jest.fn(),
    deleteObject: jest.fn(),
    getSignedObjectUrl: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    objectStorage.getSignedObjectUrl.mockResolvedValue(
      'https://signed.example.com/file',
    );
    objectStorage.streamObject.mockReturnValue(Readable.from(['file']));
  });

  function createService(): AttachmentsService {
    const service = new AttachmentsService();
    service.setObjectStorage(objectStorage);
    return service;
  }

  it('uploads task attachments through API-owned object storage', async () => {
    mockDb.attachment.create.mockResolvedValue({
      id: 'att_123',
      name: 'evidence.pdf',
      type: 'document',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    });
    objectStorage.uploadObject.mockResolvedValue({
      bucketName: 'betayum-app-data',
      key: 'org_123/attachments/task/tsk_123/evidence.pdf',
    });

    const service = createService();
    const result = await service.uploadAttachment(
      'org_123',
      'tsk_123',
      'task',
      {
        fileName: 'evidence.pdf',
        fileType: 'application/pdf',
        fileData: Buffer.from('%PDF-1.4').toString('base64'),
      },
      'user_123',
    );

    expect(objectStorage.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_123',
        contentType: 'application/pdf',
      }),
    );
    expect(mockDb.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org_123',
          entityId: 'tsk_123',
          entityType: 'task',
          url: expect.stringMatching(
            /^org_123\/attachments\/task\/tsk_123\/\d+-[a-f0-9]+-evidence\.pdf$/,
          ),
        }),
      }),
    );
    expect(result.downloadUrl).toBe('https://signed.example.com/file');
  });

  it('generates download URLs and deletes attachments through object storage', async () => {
    mockDb.attachment.findFirst.mockResolvedValue({
      id: 'att_123',
      name: 'evidence.pdf',
      type: 'document',
      url: 'org_123/attachments/task/tsk_123/evidence.pdf',
    });
    mockDb.attachment.delete.mockResolvedValue({ id: 'att_123' });

    const service = createService();
    await expect(
      service.getAttachmentDownloadUrl('org_123', 'att_123'),
    ).resolves.toEqual({
      downloadUrl: 'https://signed.example.com/file',
      expiresIn: 900,
    });

    expect(objectStorage.getSignedObjectUrl).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: 'org_123/attachments/task/tsk_123/evidence.pdf',
      action: 'read',
      expiresInSeconds: 900,
    });

    await expect(
      service.deleteAttachment('org_123', 'att_123'),
    ).resolves.toBeUndefined();
    expect(objectStorage.deleteObject).toHaveBeenCalledWith({
      organizationId: 'org_123',
      key: 'org_123/attachments/task/tsk_123/evidence.pdf',
    });
    expect(mockDb.attachment.delete).toHaveBeenCalledWith({
      where: { id: 'att_123', organizationId: 'org_123' },
    });
  });

  it('copies policy version PDFs through object storage', async () => {
    objectStorage.copyObject.mockResolvedValue({
      bucketName: 'betayum-app-data',
      key: 'org_123/policies/pol_123/versions/ver_123.pdf',
    });

    const service = createService();

    await expect(
      service.copyPolicyVersionPdf(
        'org_123/policies/pol_123/current.pdf',
        'org_123/policies/pol_123/versions/ver_123.pdf',
      ),
    ).resolves.toBe('org_123/policies/pol_123/versions/ver_123.pdf');

    expect(objectStorage.copyObject).toHaveBeenCalledWith({
      organizationId: 'org_123',
      sourceKey: 'org_123/policies/pol_123/current.pdf',
      destinationKey: 'org_123/policies/pol_123/versions/ver_123.pdf',
    });
  });
});

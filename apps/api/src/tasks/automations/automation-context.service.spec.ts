import { Readable } from 'node:stream';

const mockDb = {
  attachment: { findFirst: jest.fn(), findMany: jest.fn() },
  organizationBrowserVm: { findUnique: jest.fn() },
  task: { findFirst: jest.fn() },
};
const mockStorage = {
  getObjectMetadata: jest.fn(),
  streamObject: jest.fn(),
};
const extractContent = jest.fn();

jest.mock('@db', () => ({
  AttachmentEntityType: { task: 'task' },
  FindingStatus: { closed: 'closed' },
  db: mockDb,
}));
jest.mock('../../app/object-storage', () => ({
  objectStorage: mockStorage,
  readObjectStreamToBuffer: async (stream: Readable) => {
    let content = '';
    for await (const chunk of stream) content += String(chunk);
    return Buffer.from(content);
  },
}));
jest.mock('../../questionnaire/utils/content-extractor', () => ({
  extractContentFromFile: extractContent,
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutomationContextService } from './automation-context.service';

describe(AutomationContextService.name, () => {
  const service = new AutomationContextService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.task.findFirst.mockResolvedValue({
      id: 'tsk_1',
      title: 'Evidence task',
    });
    mockDb.attachment.findMany.mockResolvedValue([]);
    mockDb.organizationBrowserVm.findUnique.mockResolvedValue(null);
  });

  it('loads context with organization and task scoping', async () => {
    await service.getContext({ organizationId: 'org_1', taskId: 'tsk_1' });

    expect(mockDb.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tsk_1', organizationId: 'org_1', archivedAt: null },
      }),
    );
    expect(mockDb.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org_1',
          entityId: 'tsk_1',
          entityType: 'task',
        },
      }),
    );
  });

  it('extracts only an attachment belonging to the scoped task', async () => {
    mockDb.attachment.findFirst.mockResolvedValue({
      id: 'att_1',
      name: 'evidence.txt',
      type: 'document',
      url: 'org_1/attachments/task/tsk_1/evidence.txt',
    });
    mockStorage.getObjectMetadata.mockResolvedValue({
      contentLength: 8,
      contentType: 'text/plain',
    });
    mockStorage.streamObject.mockReturnValue(Readable.from(['evidence']));
    extractContent.mockResolvedValue('extracted evidence');

    await expect(
      service.extractAttachment({
        attachmentId: 'att_1',
        organizationId: 'org_1',
        taskId: 'tsk_1',
      }),
    ).resolves.toEqual({
      attachmentId: 'att_1',
      name: 'evidence.txt',
      mimeType: 'text/plain',
      content: 'extracted evidence',
      sourceTruncated: false,
      totalChars: 18,
    });
    expect(mockDb.attachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org_1',
          entityId: 'tsk_1',
        }),
      }),
    );
  });

  it('rejects an attachment outside the scoped task', async () => {
    mockDb.attachment.findFirst.mockResolvedValue(null);

    await expect(
      service.extractAttachment({
        attachmentId: 'att_other',
        organizationId: 'org_1',
        taskId: 'tsk_1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockStorage.streamObject).not.toHaveBeenCalled();
  });

  it('rejects attachments larger than the extraction limit before downloading', async () => {
    mockDb.attachment.findFirst.mockResolvedValue({
      id: 'att_1',
      name: 'large.pdf',
      type: 'document',
      url: 'org_1/attachments/task/tsk_1/large.pdf',
    });
    mockStorage.getObjectMetadata.mockResolvedValue({
      contentLength: 20 * 1024 * 1024 + 1,
      contentType: 'application/pdf',
    });

    await expect(
      service.extractAttachment({
        attachmentId: 'att_1',
        organizationId: 'org_1',
        taskId: 'tsk_1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockStorage.streamObject).not.toHaveBeenCalled();
  });
});

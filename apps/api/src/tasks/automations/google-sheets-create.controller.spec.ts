import 'reflect-metadata';

jest.mock('@db', () => ({
  db: {},
  AttachmentEntityType: { task: 'task' },
  AttachmentType: { document: 'document' },
  TaskFrequency: {},
  BackgroundCheckStatus: {
    completed: 'completed',
    completed_with_flags: 'completed_with_flags',
  },
}));

jest.mock('../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock('@trycompai/auth', () => ({
  statement: { task: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

jest.mock('../tasks.service', () => ({
  TasksService: class TasksService {},
}));

import { AutomationsController } from './automations.controller';
import { GoogleSheetsService } from './google-sheets.service';
import { AttachmentsService } from '../../attachments/attachments.service';

const SHEET_RESULT = {
  spreadsheetId: 'sheet_123',
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_123/edit',
};

function buildController(overrides?: {
  sheetsCreateResult?: typeof SHEET_RESULT | Promise<never>;
  attachmentResult?: { id: string } | Promise<never>;
}) {
  const mockSheetsService = {
    createSpreadsheet: jest.fn().mockResolvedValue(overrides?.sheetsCreateResult ?? SHEET_RESULT),
    appendRows: jest.fn(),
    readValues: jest.fn(),
  } as unknown as GoogleSheetsService;

  const mockAttachmentsService = {
    uploadAttachment: jest.fn().mockResolvedValue(overrides?.attachmentResult ?? { id: 'att_1' }),
  } as unknown as AttachmentsService;

  const mockTasksService = { verifyTaskAccess: jest.fn().mockResolvedValue(undefined) };

  const controller = new AutomationsController(
    {} as never,
    {} as never,
    mockTasksService as never,
    {} as never,
    mockSheetsService,
    mockAttachmentsService,
  );

  return { controller, mockSheetsService, mockAttachmentsService, mockTasksService };
}

describe('AutomationsController.createGoogleSheet', () => {
  it('returns spreadsheetId, spreadsheetUrl, and attachedToTask:true on success', async () => {
    const { controller, mockAttachmentsService } = buildController();

    const result = await controller.createGoogleSheet(
      'org_1',
      'task_1',
      'auto_1',
      { title: 'Evidence', headers: ['Col'], rows: [['val']] },
    );

    expect(result).toMatchObject({
      spreadsheetId: 'sheet_123',
      spreadsheetUrl: SHEET_RESULT.spreadsheetUrl,
      attachedToTask: true,
    });
    expect(mockAttachmentsService.uploadAttachment).toHaveBeenCalledTimes(1);
  });

  it('returns attachedToTask:false but still returns sheet data when attachment upload fails', async () => {
    const { controller } = buildController({
      attachmentResult: Promise.reject(new Error('S3 down')),
    });

    const result = await controller.createGoogleSheet(
      'org_1',
      'task_1',
      'auto_1',
      { title: 'Evidence', headers: undefined, rows: [['val']] },
    );

    expect(result).toMatchObject({
      spreadsheetId: 'sheet_123',
      spreadsheetUrl: SHEET_RESULT.spreadsheetUrl,
      attachedToTask: false,
    });
  });

  it('does not call uploadAttachment when sheet creation fails', async () => {
    const { controller, mockAttachmentsService } = buildController({
      sheetsCreateResult: Promise.reject(new Error('Google API error')) as unknown as typeof SHEET_RESULT,
    });

    await expect(
      controller.createGoogleSheet('org_1', 'task_1', 'auto_1', { title: 'T', rows: [] }),
    ).rejects.toThrow('Google API error');

    expect(mockAttachmentsService.uploadAttachment).not.toHaveBeenCalled();
  });
});

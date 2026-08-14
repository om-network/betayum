import 'reflect-metadata';

jest.mock('@db', () => ({
  db: {},
  AttachmentEntityType: { task: 'task' },
  AttachmentType: { document: 'document' },
  TaskFrequency: {},
  AutomationSetupStatus: {
    building: 'building',
    ready: 'ready',
    action_needed: 'action_needed',
    failed: 'failed',
  },
  AutomationAssistantRunStatus: {
    queued: 'queued',
    running: 'running',
  },
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
  sheetsCreateError?: Error;
  sheetsAppendError?: Error;
  sheetsReadResult?: { spreadsheetId: string; values: (string | number)[][] };
  attachmentError?: Error;
}) {
  const mockSheetsService = {
    createSpreadsheet: overrides?.sheetsCreateError
      ? jest.fn().mockRejectedValue(overrides.sheetsCreateError)
      : jest.fn().mockResolvedValue(SHEET_RESULT),
    appendRows: overrides?.sheetsAppendError
      ? jest.fn().mockRejectedValue(overrides.sheetsAppendError)
      : jest.fn().mockResolvedValue({ success: true }),
    readValues: jest.fn().mockResolvedValue(
      overrides?.sheetsReadResult ?? {
        spreadsheetId: SHEET_RESULT.spreadsheetId,
        values: [
          ['User', 'Role'],
          ['alice@example.com', 'Admin'],
        ],
      },
    ),
  } as unknown as GoogleSheetsService;

  const mockAttachmentsService = {
    uploadAttachment: overrides?.attachmentError
      ? jest.fn().mockRejectedValue(overrides.attachmentError)
      : jest.fn().mockResolvedValue({ id: 'att_1' }),
  } as unknown as AttachmentsService;

  const mockTasksService = { verifyTaskAccess: jest.fn().mockResolvedValue(undefined) };

  const controller = new AutomationsController(
    {} as never,
    {} as never,
    mockTasksService as never,
    {} as never,
    mockSheetsService,
    mockAttachmentsService,
    {} as never,
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
      attachmentError: new Error('S3 down'),
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
      sheetsCreateError: new Error('Google API error'),
    });

    await expect(
      controller.createGoogleSheet('org_1', 'task_1', 'auto_1', { title: 'T', rows: [] }),
    ).rejects.toThrow('Google API error');

    expect(mockAttachmentsService.uploadAttachment).not.toHaveBeenCalled();
  });
});

describe('AutomationsController.appendGoogleSheet', () => {
  it('attaches the updated spreadsheet to the task immediately after appending rows', async () => {
    const { controller, mockSheetsService, mockAttachmentsService } =
      buildController();

    const result = await controller.appendGoogleSheet(
      'org_1',
      'task_1',
      'auto_1',
      'sheet_123',
      { title: 'Access Review Log', rows: [['bob@example.com', 'Viewer']] },
    );

    expect(mockSheetsService.appendRows).toHaveBeenCalledWith({
      organizationId: 'org_1',
      spreadsheetId: 'sheet_123',
      rows: [['bob@example.com', 'Viewer']],
    });
    expect(mockSheetsService.readValues).toHaveBeenCalledWith({
      organizationId: 'org_1',
      spreadsheetId: 'sheet_123',
    });
    expect(mockAttachmentsService.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(mockAttachmentsService.uploadAttachment).toHaveBeenCalledWith(
      'org_1',
      'task_1',
      'task',
      expect.objectContaining({ fileName: 'Access Review Log.csv' }),
    );
    expect(result).toEqual({ success: true, attachedToTask: true });
  });

  it('reports a failed attachment without failing the completed spreadsheet edit', async () => {
    const { controller } = buildController({
      attachmentError: new Error('S3 down'),
    });

    const result = await controller.appendGoogleSheet(
      'org_1',
      'task_1',
      'auto_1',
      'sheet_123',
      { title: 'Access Review Log', rows: [['bob@example.com', 'Viewer']] },
    );

    expect(result).toEqual({ success: true, attachedToTask: false });
  });

  it('does not read or attach the spreadsheet when the edit fails', async () => {
    const { controller, mockSheetsService, mockAttachmentsService } =
      buildController({
        sheetsAppendError: new Error('Google API error'),
      });

    await expect(
      controller.appendGoogleSheet('org_1', 'task_1', 'auto_1', 'sheet_123', {
        title: 'Access Review Log',
        rows: [['bob@example.com', 'Viewer']],
      }),
    ).rejects.toThrow('Google API error');

    expect(mockSheetsService.readValues).not.toHaveBeenCalled();
    expect(mockAttachmentsService.uploadAttachment).not.toHaveBeenCalled();
  });
});

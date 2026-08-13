import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    post: mockPost,
    get: mockGet,
  },
}));

const { buildGoogleSheetsTools } = await import('./google-sheets-tools');

const TASK_ID = 'tsk_test';
const AUTOMATION_ID = 'aut_test';

function getTools() {
  const tools = buildGoogleSheetsTools({
    taskId: TASK_ID,
    automationId: AUTOMATION_ID,
    taskTitle: 'Access Review Log',
  });
  if (!tools.createGoogleSheet.execute || !tools.updateGoogleSheet.execute || !tools.readGoogleSheet.execute) {
    throw new Error('execute not defined on tool');
  }
  return {
    createGoogleSheet: tools.createGoogleSheet as typeof tools.createGoogleSheet & {
      execute: NonNullable<typeof tools.createGoogleSheet.execute>;
    },
    updateGoogleSheet: tools.updateGoogleSheet as typeof tools.updateGoogleSheet & {
      execute: NonNullable<typeof tools.updateGoogleSheet.execute>;
    },
    readGoogleSheet: tools.readGoogleSheet as typeof tools.readGoogleSheet & {
      execute: NonNullable<typeof tools.readGoogleSheet.execute>;
    },
  };
}

describe('buildGoogleSheetsTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createGoogleSheet', () => {
    it('returns spreadsheetId and spreadsheetUrl on success', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          spreadsheetId: 'sheet_123',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_123',
          attachedToTask: true,
        },
        error: null,
      });

      const { createGoogleSheet } = getTools();
      const result = await createGoogleSheet.execute(
        {
          title: 'IAM Evidence',
          headers: ['Resource', 'Role', 'Member'],
          rows: [['project/foo', 'roles/owner', 'user@example.com']],
        },
        {} as never,
      );

      expect(mockPost).toHaveBeenCalledWith(
        `/v1/tasks/${TASK_ID}/automations/${AUTOMATION_ID}/google-sheets`,
        {
          title: 'IAM Evidence',
          headers: ['Resource', 'Role', 'Member'],
          rows: [['project/foo', 'roles/owner', 'user@example.com']],
        },
      );
      expect(result).toEqual({
        success: true,
        spreadsheetId: 'sheet_123',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_123',
        attachedToTask: true,
      });
    });

    it('returns success:false with error when API fails', async () => {
      mockPost.mockResolvedValueOnce({ data: null, error: 'Sheets API disabled' });

      const { createGoogleSheet } = getTools();
      const result = await createGoogleSheet.execute(
        { title: 'Test', rows: [['a', 1]] },
        {} as never,
      );

      expect(result).toEqual({ success: false, error: 'Sheets API disabled' });
    });

    it('returns success:false when spreadsheetId is missing', async () => {
      mockPost.mockResolvedValueOnce({ data: {}, error: null });

      const { createGoogleSheet } = getTools();
      const result = await createGoogleSheet.execute(
        { title: 'Test', rows: [] },
        {} as never,
      );

      expect(result).toEqual({ success: false, error: 'Failed to create spreadsheet' });
    });

    it('accepts mixed string and number row values', async () => {
      mockPost.mockResolvedValueOnce({
        data: { spreadsheetId: 'sheet_456', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_456' },
        error: null,
      });

      const { createGoogleSheet } = getTools();
      const result = await createGoogleSheet.execute(
        { title: 'Metrics', rows: [['cpu_usage', 87.5, 100]] },
        {} as never,
      );

      expect(result).toMatchObject({ success: true, spreadsheetId: 'sheet_456' });
    });
  });

  describe('updateGoogleSheet', () => {
    it('reports that the edited sheet was attached to the task', async () => {
      mockPost.mockResolvedValueOnce({
        data: { success: true, attachedToTask: true },
        error: null,
      });

      const { updateGoogleSheet } = getTools();
      const result = await updateGoogleSheet.execute(
        { spreadsheetId: 'sheet_123', rows: [['new_resource', 'roles/viewer', 'svc@example.com']] },
        {} as never,
      );

      expect(mockPost).toHaveBeenCalledWith(
        `/v1/tasks/${TASK_ID}/automations/${AUTOMATION_ID}/google-sheets/sheet_123/append`,
        {
          title: 'Access Review Log',
          rows: [['new_resource', 'roles/viewer', 'svc@example.com']],
        },
      );
      expect(result).toEqual({ success: true, attachedToTask: true });
    });

    it('returns success:false with error when API fails', async () => {
      mockPost.mockResolvedValueOnce({ data: null, error: 'Not found' });

      const { updateGoogleSheet } = getTools();
      const result = await updateGoogleSheet.execute(
        { spreadsheetId: 'sheet_123', rows: [['x']] },
        {} as never,
      );

      expect(result).toEqual({ success: false, error: 'Not found' });
    });
  });

  describe('readGoogleSheet', () => {
    const makeRows = (count: number) =>
      Array.from({ length: count }, (_, i) => [`resource_${i}`, i]);

    it('returns first page with hasMore:true for large sheet', async () => {
      const values = makeRows(250);
      mockGet.mockResolvedValueOnce({
        data: { spreadsheetId: 'sheet_123', values },
        error: null,
      });

      const { readGoogleSheet } = getTools();
      const result = await readGoogleSheet.execute(
        { spreadsheetId: 'sheet_123', rowOffset: 0 },
        {} as never,
      );

      expect(mockGet).toHaveBeenCalledWith(
        `/v1/tasks/${TASK_ID}/automations/${AUTOMATION_ID}/google-sheets/sheet_123`,
      );
      expect(result).toMatchObject({
        rowOffset: 0,
        nextRowOffset: 100,
        totalRows: 250,
        hasMore: true,
      });
      expect((result as { rows: unknown[] }).rows).toHaveLength(100);
    });

    it('returns middle page correctly', async () => {
      const values = makeRows(250);
      mockGet.mockResolvedValueOnce({ data: { spreadsheetId: 'sheet_123', values }, error: null });

      const { readGoogleSheet } = getTools();
      const result = await readGoogleSheet.execute(
        { spreadsheetId: 'sheet_123', rowOffset: 100 },
        {} as never,
      );

      expect(result).toMatchObject({ rowOffset: 100, nextRowOffset: 200, hasMore: true });
    });

    it('returns hasMore:false on final page', async () => {
      const values = makeRows(250);
      mockGet.mockResolvedValueOnce({ data: { spreadsheetId: 'sheet_123', values }, error: null });

      const { readGoogleSheet } = getTools();
      const result = await readGoogleSheet.execute(
        { spreadsheetId: 'sheet_123', rowOffset: 200 },
        {} as never,
      );

      expect(result).toMatchObject({ rowOffset: 200, nextRowOffset: 250, hasMore: false });
      expect((result as { rows: unknown[] }).rows).toHaveLength(50);
    });

    it('passes range query param when provided', async () => {
      mockGet.mockResolvedValueOnce({
        data: { spreadsheetId: 'sheet_123', values: [['a', 'b']] },
        error: null,
      });

      const { readGoogleSheet } = getTools();
      await readGoogleSheet.execute(
        { spreadsheetId: 'sheet_123', rowOffset: 0, range: 'A1:C10' },
        {} as never,
      );

      expect(mockGet).toHaveBeenCalledWith(
        `/v1/tasks/${TASK_ID}/automations/${AUTOMATION_ID}/google-sheets/sheet_123?range=A1%3AC10`,
      );
    });

    it('returns success:false with error when API fails', async () => {
      mockGet.mockResolvedValueOnce({ data: null, error: 'Sheets API error' });

      const { readGoogleSheet } = getTools();
      const result = await readGoogleSheet.execute(
        { spreadsheetId: 'sheet_123', rowOffset: 0 },
        {} as never,
      );

      expect(result).toEqual({ success: false, error: 'Sheets API error' });
    });
  });
});

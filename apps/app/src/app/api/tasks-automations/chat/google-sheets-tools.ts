import { serverApi } from '@/lib/api-server';
import { tool } from 'ai';
import { z } from 'zod';

const SHEET_PAGE_SIZE = 100;

interface GoogleSheetsToolsParams {
  taskId: string;
  automationId: string;
  taskTitle: string;
}

interface SheetReadResponse {
  spreadsheetId: string;
  values: (string | number)[][];
}

const cellValue = z.union([z.string(), z.number()]);

export function buildGoogleSheetsTools({ taskId, automationId, taskTitle }: GoogleSheetsToolsParams) {
  return {
    createGoogleSheet: tool({
      description:
        'Create a Google Spreadsheet to log tabular evidence collection results. Prefer this over createGoogleDoc when the data is structured/tabular (lists of resources, findings, rows).',
      inputSchema: z.object({
        title: z.string().describe('Title for the spreadsheet'),
        headers: z.array(cellValue).optional().describe('Optional header row'),
        rows: z.array(z.array(cellValue)).describe('Data rows to populate the sheet'),
      }),
      execute: async ({ title, headers, rows }) => {
        const result = await serverApi.post<{ spreadsheetId: string; spreadsheetUrl: string; attachedToTask: boolean }>(
          `/v1/tasks/${taskId}/automations/${automationId}/google-sheets`,
          { title, headers, rows },
        );
        if (result.error || !result.data?.spreadsheetId) {
          return { success: false, error: result.error ?? 'Failed to create spreadsheet' };
        }
        return {
          success: true,
          spreadsheetId: result.data.spreadsheetId,
          spreadsheetUrl: result.data.spreadsheetUrl,
          attachedToTask: result.data.attachedToTask ?? false,
        };
      },
    }),
    updateGoogleSheet: tool({
      description:
        'Append rows to an existing Google Spreadsheet and immediately upload the edited sheet as a CSV task attachment. Use the spreadsheetId returned by createGoogleSheet or read from the task template URL.',
      inputSchema: z.object({
        spreadsheetId: z.string().describe('The ID of the spreadsheet to append to'),
        rows: z.array(z.array(cellValue)).describe('Rows to append'),
      }),
      execute: async ({ spreadsheetId, rows }) => {
        const result = await serverApi.post<{ success: boolean; attachedToTask: boolean }>(
          `/v1/tasks/${taskId}/automations/${automationId}/google-sheets/${spreadsheetId}/append`,
          { title: taskTitle, rows },
        );
        if (result.error) {
          return { success: false, error: result.error };
        }
        return {
          success: result.data?.success ?? true,
          attachedToTask: result.data?.attachedToTask ?? false,
        };
      },
    }),
    readGoogleSheet: tool({
      description:
        'Read rows from an existing Google Spreadsheet by row offset. Use to verify contents before appending or to review previously logged evidence. Call repeatedly with increasing rowOffset until hasMore is false.',
      inputSchema: z.object({
        spreadsheetId: z.string().describe('The ID of the spreadsheet to read'),
        rowOffset: z.number().int().min(0).default(0).describe('Row index to start reading from (0-based)'),
        range: z.string().optional().describe('Optional A1 notation range, e.g. "A1:Z1000"'),
      }),
      execute: async ({ spreadsheetId, rowOffset, range }) => {
        const url = range
          ? `/v1/tasks/${taskId}/automations/${automationId}/google-sheets/${spreadsheetId}?range=${encodeURIComponent(range)}`
          : `/v1/tasks/${taskId}/automations/${automationId}/google-sheets/${spreadsheetId}`;
        const result = await serverApi.get<SheetReadResponse>(url);
        if (result.error || !result.data) {
          return { success: false, error: result.error ?? 'Failed to read spreadsheet' };
        }
        const allRows = result.data.values ?? [];
        const totalRows = allRows.length;
        const safeOffset = Math.min(rowOffset, totalRows);
        const rows = allRows.slice(safeOffset, safeOffset + SHEET_PAGE_SIZE);
        const nextRowOffset = safeOffset + rows.length;
        const hasMore = nextRowOffset < totalRows;
        return { rows, rowOffset: safeOffset, nextRowOffset, totalRows, hasMore };
      },
    }),
  };
}

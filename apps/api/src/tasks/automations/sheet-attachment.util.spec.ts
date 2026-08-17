import { buildCsv, attachSheetAsCsv } from './sheet-attachment.util';
import { AttachmentsService } from '../../attachments/attachments.service';
import { AttachmentEntityType } from '@db';

jest.mock('@db', () => ({ AttachmentEntityType: { task: 'task' } }));

describe('buildCsv', () => {
  it('renders a simple row without quoting', () => {
    expect(buildCsv(undefined, [['foo', 'bar']])).toBe('foo,bar');
  });

  it('prepends a header row when provided', () => {
    expect(buildCsv(['A', 'B'], [['1', '2']])).toBe('A,B\r\n1,2');
  });

  it('wraps fields containing a comma in double quotes', () => {
    expect(buildCsv(undefined, [['hello, world', 'ok']])).toBe(
      '"hello, world",ok',
    );
  });

  it('wraps fields containing a double quote and escapes inner quotes', () => {
    expect(buildCsv(undefined, [['say "hi"', 'ok']])).toBe('"say ""hi""",ok');
  });

  it('wraps fields containing a newline in double quotes', () => {
    expect(buildCsv(undefined, [['line1\nline2', 'ok']])).toBe(
      '"line1\nline2",ok',
    );
  });

  it('wraps fields containing a carriage return in double quotes', () => {
    expect(buildCsv(undefined, [['a\rb', 'x']])).toBe('"a\rb",x');
  });

  it('renders numbers as-is without quoting', () => {
    expect(buildCsv(undefined, [[42, 3.14]])).toBe('42,3.14');
  });

  it('handles empty rows array', () => {
    expect(buildCsv(undefined, [])).toBe('');
  });

  it('handles headers-only (no data rows)', () => {
    expect(buildCsv(['Col1', 'Col2'], [])).toBe('Col1,Col2');
  });

  it('joins multiple rows with CRLF', () => {
    const csv = buildCsv(undefined, [
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(csv).toBe('a,b\r\nc,d');
  });
});

describe('attachSheetAsCsv', () => {
  const mockUploadAttachment = jest.fn();
  const mockAttachmentsService = {
    uploadAttachment: mockUploadAttachment,
  } as unknown as AttachmentsService;

  const baseArgs = {
    attachmentsService: mockAttachmentsService,
    organizationId: 'org_1',
    taskId: 'task_1',
    automationId: 'auto_1',
    title: 'My Sheet',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
    headers: ['Name', 'Status'],
    rows: [['alice', 'ok']],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls uploadAttachment with correct entityType and taskId, returns true on success', async () => {
    mockUploadAttachment.mockResolvedValue({
      id: 'att_1',
      name: 'My Sheet.csv',
    });

    const result = await attachSheetAsCsv(baseArgs);

    expect(result).toBe(true);
    expect(mockUploadAttachment).toHaveBeenCalledTimes(1);

    const [orgId, entityId, entityType, dto] = mockUploadAttachment.mock
      .calls[0] as [
      string,
      string,
      AttachmentEntityType,
      {
        fileName: string;
        fileType: string;
        fileData: string;
        description: string;
      },
    ];
    expect(orgId).toBe('org_1');
    expect(entityId).toBe('task_1');
    expect(entityType).toBe('task');
    expect(dto.fileName).toBe('My Sheet.csv');
    expect(dto.fileType).toBe('text/csv');
    expect(dto.description).toContain('auto_1');
    expect(dto.description).toContain(
      'https://docs.google.com/spreadsheets/d/abc/edit',
    );

    const decoded = Buffer.from(dto.fileData, 'base64').toString('utf-8');
    expect(decoded).toBe('Name,Status\r\nalice,ok');
  });

  it('returns false and does NOT rethrow when uploadAttachment throws', async () => {
    mockUploadAttachment.mockRejectedValue(new Error('S3 unavailable'));

    const result = await attachSheetAsCsv(baseArgs);

    expect(result).toBe(false);
    expect(mockUploadAttachment).toHaveBeenCalledTimes(1);
  });

  it('sanitizes invalid filename characters', async () => {
    mockUploadAttachment.mockResolvedValue({ id: 'att_2' });

    await attachSheetAsCsv({ ...baseArgs, title: 'My/Sheet:2024' });

    const [, , , dto] = mockUploadAttachment.mock.calls[0] as [
      string,
      string,
      AttachmentEntityType,
      { fileName: string },
    ];
    expect(dto.fileName).not.toMatch(/[/:\\]/);
    expect(dto.fileName).toMatch(/\.csv$/);
  });

  it('truncates fileName to 255 characters', async () => {
    mockUploadAttachment.mockResolvedValue({ id: 'att_3' });
    const longTitle = 'A'.repeat(300);

    await attachSheetAsCsv({ ...baseArgs, title: longTitle });

    const [, , , dto] = mockUploadAttachment.mock.calls[0] as [
      string,
      string,
      AttachmentEntityType,
      { fileName: string },
    ];
    expect(dto.fileName.length).toBeLessThanOrEqual(255);
    expect(dto.fileName).toMatch(/\.csv$/);
  });

  it('truncates description to 500 characters', async () => {
    mockUploadAttachment.mockResolvedValue({ id: 'att_4' });
    const longUrl = 'https://example.com/' + 'x'.repeat(600);

    await attachSheetAsCsv({ ...baseArgs, spreadsheetUrl: longUrl });

    const [, , , dto] = mockUploadAttachment.mock.calls[0] as [
      string,
      string,
      AttachmentEntityType,
      { description?: string },
    ];
    expect((dto.description ?? '').length).toBeLessThanOrEqual(500);
  });

  it('works without headers', async () => {
    mockUploadAttachment.mockResolvedValue({ id: 'att_5' });

    await attachSheetAsCsv({ ...baseArgs, headers: undefined });

    const [, , , dto] = mockUploadAttachment.mock.calls[0] as [
      string,
      string,
      AttachmentEntityType,
      { fileData: string },
    ];
    const decoded = Buffer.from(dto.fileData, 'base64').toString('utf-8');
    expect(decoded).toBe('alice,ok');
  });
});

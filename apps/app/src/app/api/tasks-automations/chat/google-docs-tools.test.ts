import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    post: mockPost,
    get: mockGet,
  },
}));

const { buildGoogleDocsTools } = await import('./google-docs-tools');

const TASK_ID = 'tsk_test';
const AUTOMATION_ID = 'aut_test';

function getTools() {
  const tools = buildGoogleDocsTools({ taskId: TASK_ID, automationId: AUTOMATION_ID });
  if (
    !tools.createGoogleDoc.execute ||
    !tools.updateGoogleDoc.execute ||
    !tools.readGoogleDoc.execute
  ) {
    throw new Error('execute not defined on tool');
  }
  return {
    createGoogleDoc: tools.createGoogleDoc as typeof tools.createGoogleDoc & {
      execute: NonNullable<typeof tools.createGoogleDoc.execute>;
    },
    updateGoogleDoc: tools.updateGoogleDoc as typeof tools.updateGoogleDoc & {
      execute: NonNullable<typeof tools.updateGoogleDoc.execute>;
    },
    readGoogleDoc: tools.readGoogleDoc as typeof tools.readGoogleDoc & {
      execute: NonNullable<typeof tools.readGoogleDoc.execute>;
    },
  };
}

describe('buildGoogleDocsTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createGoogleDoc', () => {
    it('returns documentId and documentUrl on success', async () => {
      mockPost.mockResolvedValueOnce({
        data: { documentId: 'doc_123', documentUrl: 'https://docs.google.com/document/d/doc_123' },
        error: null,
      });

      const { createGoogleDoc } = getTools();
      const result = await createGoogleDoc.execute(
        { title: 'Evidence Report', content: 'collected data' },
        {} as never,
      );

      expect(mockPost).toHaveBeenCalledWith(
        `/v1/tasks/${TASK_ID}/automations/${AUTOMATION_ID}/google-docs`,
        { title: 'Evidence Report', content: 'collected data' },
      );
      expect(result).toEqual({
        success: true,
        documentId: 'doc_123',
        documentUrl: 'https://docs.google.com/document/d/doc_123',
      });
    });

    it('returns success:false with error when API fails', async () => {
      mockPost.mockResolvedValueOnce({ data: null, error: 'Unauthorized' });

      const { createGoogleDoc } = getTools();
      const result = await createGoogleDoc.execute(
        { title: 'Evidence Report', content: 'data' },
        {} as never,
      );

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns success:false when documentId is missing', async () => {
      mockPost.mockResolvedValueOnce({ data: {}, error: null });

      const { createGoogleDoc } = getTools();
      const result = await createGoogleDoc.execute(
        { title: 'Evidence Report', content: 'data' },
        {} as never,
      );

      expect(result).toEqual({ success: false, error: 'Failed to create document' });
    });
  });

  describe('updateGoogleDoc', () => {
    it('returns success:true on append', async () => {
      mockPost.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { updateGoogleDoc } = getTools();
      const result = await updateGoogleDoc.execute(
        { documentId: 'doc_123', content: 'more evidence' },
        {} as never,
      );

      expect(mockPost).toHaveBeenCalledWith(
        `/v1/tasks/${TASK_ID}/automations/${AUTOMATION_ID}/google-docs/doc_123/append`,
        { content: 'more evidence' },
      );
      expect(result).toEqual({ success: true });
    });

    it('returns success:false with error when API fails', async () => {
      mockPost.mockResolvedValueOnce({ data: null, error: 'Not found' });

      const { updateGoogleDoc } = getTools();
      const result = await updateGoogleDoc.execute(
        { documentId: 'doc_123', content: 'data' },
        {} as never,
      );

      expect(result).toEqual({ success: false, error: 'Not found' });
    });
  });

  describe('readGoogleDoc', () => {
    const content = 'A'.repeat(10000);

    it('returns first chunk with hasMore:true', async () => {
      mockGet.mockResolvedValueOnce({
        data: { documentId: 'doc_123', title: 'Evidence Report', content },
        error: null,
      });

      const { readGoogleDoc } = getTools();
      const result = await readGoogleDoc.execute({ documentId: 'doc_123', offset: 0 }, {} as never);

      expect(mockGet).toHaveBeenCalledWith(
        `/v1/tasks/${TASK_ID}/automations/${AUTOMATION_ID}/google-docs/doc_123`,
      );
      expect(result).toMatchObject({
        title: 'Evidence Report',
        offset: 0,
        nextOffset: 4000,
        totalChars: 10000,
        hasMore: true,
      });
      expect((result as { chunk: string }).chunk).toHaveLength(4000);
    });

    it('returns middle chunk correctly', async () => {
      mockGet.mockResolvedValueOnce({
        data: { documentId: 'doc_123', title: 'Report', content },
        error: null,
      });

      const { readGoogleDoc } = getTools();
      const result = await readGoogleDoc.execute(
        { documentId: 'doc_123', offset: 4000 },
        {} as never,
      );

      expect(result).toMatchObject({ offset: 4000, nextOffset: 8000, hasMore: true });
    });

    it('returns hasMore:false on final chunk', async () => {
      mockGet.mockResolvedValueOnce({
        data: { documentId: 'doc_123', title: 'Report', content },
        error: null,
      });

      const { readGoogleDoc } = getTools();
      const result = await readGoogleDoc.execute(
        { documentId: 'doc_123', offset: 8000 },
        {} as never,
      );

      expect(result).toMatchObject({ offset: 8000, nextOffset: 10000, hasMore: false });
    });

    it('returns success:false with error when API fails', async () => {
      mockGet.mockResolvedValueOnce({ data: null, error: 'Docs API error' });

      const { readGoogleDoc } = getTools();
      const result = await readGoogleDoc.execute({ documentId: 'doc_123', offset: 0 }, {} as never);

      expect(result).toEqual({ success: false, error: 'Docs API error' });
    });
  });
});

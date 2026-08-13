import { vi } from 'vitest';

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));
vi.mock('@/lib/api-server', () => ({ serverApi: { post: mockPost } }));

import { buildReadTaskAttachmentTool } from './read-task-attachment-tool';

const attachment = {
  id: 'att_1',
  name: 'evidence.txt',
  type: 'document',
  mimeType: 'text/plain',
  createdAt: new Date().toISOString(),
  sourceRunId: null,
};

describe('readTaskAttachment', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('extracts once and serves request-local chunks', async () => {
    mockPost.mockResolvedValue({
      error: null,
      data: {
        attachmentId: 'att_1',
        name: 'evidence.txt',
        mimeType: 'text/plain',
        content: 'a'.repeat(13_000),
        sourceTruncated: false,
        totalChars: 13_000,
      },
    });
    const tools = buildReadTaskAttachmentTool({ attachments: [attachment], taskId: 'tsk_1' });

    const first = await tools.readTaskAttachment?.execute?.(
      { attachmentId: 'att_1', offset: 0 },
      { abortSignal: undefined, messages: [], toolCallId: 'call_1' },
    );
    const second = await tools.readTaskAttachment?.execute?.(
      { attachmentId: 'att_1', offset: 12_000 },
      { abortSignal: undefined, messages: [], toolCallId: 'call_2' },
    );

    expect(first).toEqual(expect.objectContaining({ hasMore: true, totalChars: 13_000 }));
    expect(second).toEqual(expect.objectContaining({ hasMore: false, content: 'a'.repeat(1_000) }));
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('rejects attachment IDs outside the task context', async () => {
    const tools = buildReadTaskAttachmentTool({ attachments: [attachment], taskId: 'tsk_1' });
    await expect(
      tools.readTaskAttachment?.execute?.(
        { attachmentId: 'att_other', offset: 0 },
        { abortSignal: undefined, messages: [], toolCallId: 'call_1' },
      ),
    ).resolves.toEqual({ success: false, error: 'Attachment is not part of this task' });
    expect(mockPost).not.toHaveBeenCalled();
  });
});

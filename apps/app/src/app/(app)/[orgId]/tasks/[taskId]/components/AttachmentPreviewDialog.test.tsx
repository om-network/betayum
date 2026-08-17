import { api } from '@/lib/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog';

vi.mock('@/lib/api-client', () => ({
  api: {
    raw: vi.fn(),
  },
}));

vi.mock('@trycompai/design-system', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: React.PropsWithChildren<
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      iconLeft?: React.ReactNode;
      loading?: boolean;
      variant?: string;
    }
  >) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Dialog: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

const mockRaw = vi.mocked(api.raw);
const mockCreateObjectUrl = vi.fn(() => 'blob:attachment-preview');
const mockRevokeObjectUrl = vi.fn();

describe('AttachmentPreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = mockCreateObjectUrl;
    URL.revokeObjectURL = mockRevokeObjectUrl;
  });

  it('renders an image attachment inside the modal', async () => {
    mockRaw.mockResolvedValue(
      new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }),
    );

    render(
      <AttachmentPreviewDialog
        attachment={{ id: 'att_image', name: 'evidence.png' }}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(await screen.findByRole('img', { name: 'evidence.png' })).toHaveAttribute(
      'src',
      'blob:attachment-preview',
    );
    expect(mockRaw).toHaveBeenCalledWith('/v1/attachments/att_image/stream');
  });

  it('renders JSON and other text attachments as readable text', async () => {
    mockRaw.mockResolvedValue(
      new Response('{"compliant":true}', {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    render(
      <AttachmentPreviewDialog
        attachment={{ id: 'att_json', name: 'evidence.json' }}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(await screen.findByText('{"compliant":true}')).toBeInTheDocument();
  });

  it('does not automatically download unsupported file formats', async () => {
    render(
      <AttachmentPreviewDialog
        attachment={{ id: 'att_docx', name: 'evidence.docx' }}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(
      screen.getByText('A browser preview is not available for this file type.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockRaw).not.toHaveBeenCalled());
  });

  it('keeps downloading as an explicit modal action', () => {
    const handleDownload = vi.fn();

    render(
      <AttachmentPreviewDialog
        attachment={{ id: 'att_docx', name: 'evidence.docx' }}
        onClose={vi.fn()}
        onDownload={handleDownload}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(handleDownload).toHaveBeenCalledWith('att_docx');
  });
});

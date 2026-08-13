import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setMockPermissions } from '@/test-utils/mocks/permissions';

const { mockCanUpdateTask } = vi.hoisted(() => ({ mockCanUpdateTask: vi.fn(() => true) }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: mockCanUpdateTask }),
}));

// Mock the task API hooks
const mockRefreshAttachments = vi.fn();
const mockUploadAttachment = vi.fn();
const mockGetDownloadUrl = vi.fn();
const mockDeleteAttachment = vi.fn();

vi.mock('@/hooks/use-tasks-api', () => ({
  useTaskAttachments: vi.fn(),
  useTaskAttachmentActions: vi.fn(() => ({
    uploadAttachment: mockUploadAttachment,
    getDownloadUrl: mockGetDownloadUrl,
    deleteAttachment: mockDeleteAttachment,
  })),
}));

// Mock UI components to simplify rendering
vi.mock('@trycompai/design-system', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: React.PropsWithChildren<
    React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }
  >) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Dialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('./AttachmentPreviewDialog', () => ({
  AttachmentPreviewDialog: ({ attachment }: { attachment: { name: string } | null }) =>
    attachment ? <div>Previewing {attachment.name}</div> : null,
}));

import { useTaskAttachments } from '@/hooks/use-tasks-api';
import { TaskBody } from './TaskBody';

const mockUseTaskAttachments = vi.mocked(useTaskAttachments);

describe('TaskBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanUpdateTask.mockReturnValue(true);
    setMockPermissions({ task: ['read', 'update'] });
  });

  it('disables attachment mutations for read-only users', () => {
    mockCanUpdateTask.mockReturnValue(false);
    mockUseTaskAttachments.mockReturnValue({
      data: { data: [], status: 200 } as never,
      error: undefined,
      isLoading: false,
      mutate: mockRefreshAttachments,
      isValidating: false,
    });
    render(<TaskBody taskId="tsk_123" />);
    expect(screen.getByRole('button', { name: /drag and drop files here/i })).toBeDisabled();
  });

  it('should show upload dropzone even when attachments are loading', () => {
    mockUseTaskAttachments.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: mockRefreshAttachments,
      isValidating: false,
    });

    render(<TaskBody taskId="tsk_123" />);

    expect(screen.getByText('Drag and drop files here')).toBeInTheDocument();
  });

  it('should show upload dropzone when attachments data is undefined (SWR key is null)', () => {
    mockUseTaskAttachments.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      mutate: mockRefreshAttachments,
      isValidating: false,
    });

    render(<TaskBody taskId="tsk_123" />);

    expect(screen.getByText('Drag and drop files here')).toBeInTheDocument();
  });

  it('should show upload dropzone when attachments have loaded successfully', () => {
    mockUseTaskAttachments.mockReturnValue({
      data: { data: [], status: 200 } as never,
      error: undefined,
      isLoading: false,
      mutate: mockRefreshAttachments,
      isValidating: false,
    });

    render(<TaskBody taskId="tsk_123" />);

    expect(screen.getByText('Drag and drop files here')).toBeInTheDocument();
  });

  it('should show upload dropzone when attachments fail to load', () => {
    mockUseTaskAttachments.mockReturnValue({
      data: undefined,
      error: new Error('Failed to fetch'),
      isLoading: false,
      mutate: mockRefreshAttachments,
      isValidating: false,
    });

    render(<TaskBody taskId="tsk_123" />);

    expect(screen.getByText('Drag and drop files here')).toBeInTheDocument();
    expect(screen.getByText('Failed to load attachments. Please try again.')).toBeInTheDocument();
  });

  it('should show loading skeletons while attachments are loading', () => {
    mockUseTaskAttachments.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: mockRefreshAttachments,
      isValidating: false,
    });

    const { container } = render(<TaskBody taskId="tsk_123" />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('should not show loading skeletons when attachments have loaded', () => {
    mockUseTaskAttachments.mockReturnValue({
      data: { data: [], status: 200 } as never,
      error: undefined,
      isLoading: false,
      mutate: mockRefreshAttachments,
      isValidating: false,
    });

    const { container } = render(<TaskBody taskId="tsk_123" />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(0);
  });

  it('opens an attachment preview instead of downloading on filename click', () => {
    mockUseTaskAttachments.mockReturnValue({
      data: {
        data: [
          {
            id: 'att_123',
            name: 'evidence.json',
            type: 'document',
            createdAt: '2026-07-24T00:00:00.000Z',
          },
        ],
        status: 200,
      } as never,
      error: undefined,
      isLoading: false,
      mutate: mockRefreshAttachments,
      isValidating: false,
    });

    render(<TaskBody taskId="tsk_123" />);

    fireEvent.click(screen.getByRole('button', { name: 'evidence.json' }));

    expect(screen.getByText('Previewing evidence.json')).toBeInTheDocument();
    expect(mockGetDownloadUrl).not.toHaveBeenCalled();
  });
});

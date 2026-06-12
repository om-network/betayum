import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  NO_PERMISSIONS,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock usePermissions ─────────────────────────────────────

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: {},
    hasPermission: mockHasPermission,
  }),
}));

// ─── Mock SWR ────────────────────────────────────────────────

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  })),
  useSWRConfig: () => ({
    mutate: vi.fn(),
  }),
}));

// ─── Mock api client ─────────────────────────────────────────

vi.mock('@/lib/api-client', () => ({
  api: {
    delete: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    get: vi.fn().mockResolvedValue({ data: null, error: null }),
    post: vi.fn().mockResolvedValue({ data: null, error: null }),
    raw: vi.fn().mockResolvedValue({ ok: true, status: 200, blob: vi.fn() }),
  },
}));

// ─── Mock auth and navigation ────────────────────────────────

vi.mock('@/utils/auth-client', () => ({
  useActiveMember: () => ({
    data: { id: 'member_1', role: 'admin' },
  }),
}));

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: vi.fn(() => ({ push: vi.fn() })),
    useSearchParams: vi.fn(() => new URLSearchParams()),
  };
});

// ─── Mock form metadata ──────────────────────────────────────

vi.mock('@/app/(app)/[orgId]/documents/form-descriptions', () => ({
  conciseFormDescriptions: {
    'access-request': 'Access request evidence',
  },
}));

vi.mock('@/app/(app)/[orgId]/documents/forms', () => ({
  evidenceFormDefinitions: {
    'access-request': {
      title: 'Access Request',
      description: 'Access request evidence',
      fields: [{ key: 'summary', type: 'textarea' }],
    },
    'board-meeting': {
      title: 'Board Meeting',
      description: 'Board meeting evidence',
      fields: [{ key: 'summary', type: 'textarea' }],
    },
    'it-leadership-meeting': {
      title: 'IT Leadership Meeting',
      description: 'IT leadership evidence',
      fields: [{ key: 'summary', type: 'textarea' }],
    },
    'risk-committee-meeting': {
      title: 'Risk Committee Meeting',
      description: 'Risk committee evidence',
      fields: [{ key: 'summary', type: 'textarea' }],
    },
    meeting: {
      title: 'Meeting',
      description: 'Meeting evidence',
      fields: [{ key: 'summary', type: 'textarea' }],
    },
  },
  meetingSubTypeValues: ['board-meeting', 'it-leadership-meeting', 'risk-committee-meeting'],
  meetingSubTypes: [
    { value: 'board-meeting', label: 'Board' },
    { value: 'it-leadership-meeting', label: 'IT Leadership' },
    { value: 'risk-committee-meeting', label: 'Risk Committee' },
  ],
}));

// ─── Mock design system ──────────────────────────────────────

vi.mock('@trycompai/design-system', () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  AlertDialogCancel: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Button: ({ children, iconLeft, ...props }: any) => (
    <button {...props}>
      {iconLeft}
      {children}
    </button>
  ),
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  DropdownMenuTrigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Empty: ({ children }: any) => <div>{children}</div>,
  EmptyDescription: ({ children }: any) => <p>{children}</p>,
  EmptyHeader: ({ children }: any) => <div>{children}</div>,
  EmptyMedia: ({ children }: any) => <div>{children}</div>,
  EmptyTitle: ({ children }: any) => <h3>{children}</h3>,
  InputGroup: ({ children }: any) => <div>{children}</div>,
  InputGroupAddon: ({ children }: any) => <div>{children}</div>,
  InputGroupInput: (props: any) => <input {...props} />,
  PageHeader: ({ title, actions }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actions}
    </div>
  ),
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: ({ children, placeholder }: any) => <span>{children ?? placeholder}</span>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
  Table: ({ children }: any) => <table>{children}</table>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableCell: ({ children }: any) => <td>{children}</td>,
  TableHead: ({ children }: any) => <th>{children}</th>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@trycompai/design-system/icons', () => ({
  Add: () => <span data-testid="add-icon" />,
  Catalog: () => <span data-testid="catalog-icon" />,
  Download: () => <span data-testid="download-icon" />,
  OverflowMenuVertical: () => <span data-testid="overflow-icon" />,
  Search: () => <span data-testid="search-icon" />,
  TrashCan: () => <span data-testid="trash-icon" />,
  Upload: () => <span data-testid="upload-icon" />,
}));

// ─── Mock submission-utils ───────────────────────────────────

vi.mock('./submission-utils', () => ({
  StatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
  formatSubmissionDate: () => '01/01/2025',
}));

// ─── Mock sonner ─────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Mock next/link ──────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

import { CompanyFormPageClient } from './CompanyFormPageClient';

// ─── Tests ───────────────────────────────────────────────────

describe('CompanyFormPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Admin user (full permissions)', () => {
    beforeEach(() => {
      setMockPermissions(ADMIN_PERMISSIONS);
    });

    it('renders the New Submission button when user has evidence:create', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      expect(screen.getByText('New Submission')).toBeInTheDocument();
    });

    it('renders the Export CSV button when user has evidence:read', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    it('renders upload evidence action', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      expect(screen.getByText('Upload Evidence')).toBeInTheDocument();
    });
  });

  describe('Auditor user (read-only)', () => {
    beforeEach(() => {
      setMockPermissions(AUDITOR_PERMISSIONS);
    });

    it('renders New Submission button', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      expect(screen.getByText('New Submission')).toBeInTheDocument();
    });

    it('shows Export CSV when auditor has evidence:read', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      const hasRead = mockHasPermission('evidence', 'read');
      if (hasRead) {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      }
    });

    it('still renders the submissions empty state', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      expect(screen.getByText('No submissions yet')).toBeInTheDocument();
    });
  });

  describe('No permissions', () => {
    beforeEach(() => {
      setMockPermissions(NO_PERMISSIONS);
    });

    it('renders New Submission button', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      expect(screen.getByText('New Submission')).toBeInTheDocument();
    });

    it('renders Export CSV button', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    it('still renders the page header', () => {
      render(<CompanyFormPageClient organizationId="org-1" formType="access-request" />);

      expect(screen.getByTestId('page-header')).toBeInTheDocument();
    });
  });
});

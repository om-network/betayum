import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

const { serverApiGet } = vi.hoisted(() => ({
  serverApiGet: vi.fn(),
}));

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    get: serverApiGet,
  },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock('./actions/task-automation-actions', () => ({
  loadChatHistory: vi.fn(async () => ({
    success: true,
    data: { messages: [], total: 0, hasMore: false },
  })),
}));

vi.mock('./automation-layout-wrapper', () => ({
  AutomationLayoutWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./components/AutomationPageClient', () => ({
  AutomationPageClient: () => <div>Automation Builder</div>,
}));

vi.mock('./lib/chat-context', () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Automation page', () => {
  it('renders without the removed enterprise license gate', async () => {
    delete process.env.ENTERPRISE_API_SECRET;
    serverApiGet.mockResolvedValue({
      data: {
        id: 'tsk_1',
        title: 'Collect evidence',
        description: 'Collect evidence for the control',
      },
      error: null,
    });

    render(
      await Page({
        params: Promise.resolve({
          orgId: 'org_1',
          taskId: 'tsk_1',
          automationId: 'new',
        }),
      }),
    );

    expect(screen.getByText('Automation Builder')).toBeInTheDocument();
    expect(screen.queryByText('Enterprise Feature')).not.toBeInTheDocument();
  });
});

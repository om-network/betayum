import { fireEvent, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ai-elements/conversation', () => ({
  Conversation: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ConversationContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ConversationEmptyState: ({
    title,
  }: {
    icon?: React.ReactNode;
    title: string;
  }) => <div>{title}</div>,
  ConversationScrollButton: () => null,
}));

vi.mock('../logo-spinner', () => ({
  LogoSpinner: () => <span data-testid="logo-spinner" />,
}));

import { AssistantConversation } from './assistant-conversation';

const baseProps = {
  error: undefined,
  firstName: 'Pat',
  isHydrating: false,
  isStreaming: false,
  messages: [] satisfies UIMessage[],
  onRetry: vi.fn(),
  status: 'ready' as const,
};

describe('AssistantConversation', () => {
  it('greets with the first name when available', () => {
    render(<AssistantConversation {...baseProps} />);

    expect(
      screen.getByText('Hi Pat, how can I help you today?'),
    ).toBeInTheDocument();
  });

  it('greets without a name before the session resolves', () => {
    render(<AssistantConversation {...baseProps} firstName="" />);

    expect(
      screen.getByText('Hi, how can I help you today?'),
    ).toBeInTheDocument();
  });

  it('shows a subtle loading state while chat history hydrates', () => {
    render(<AssistantConversation {...baseProps} isHydrating />);

    expect(screen.getByText('Loading chat history...')).toBeInTheDocument();
    expect(screen.queryByText(/how can I help you today/i)).not.toBeInTheDocument();
  });

  it('shows a generic assistant thinking row after a user submits', () => {
    render(
      <AssistantConversation
        {...baseProps}
        messages={[
          {
            id: 'msg-user',
            role: 'user',
            parts: [{ type: 'text', text: 'Summarize our open gaps.' }],
          },
        ]}
        status="submitted"
      />,
    );

    expect(screen.getByText('Summarize our open gaps.')).toBeInTheDocument();
    expect(screen.getByText('Betayum is thinking...')).toBeInTheDocument();
  });

  it('shows an inline failed response with retry while preserving the user message', () => {
    const handleRetry = vi.fn();

    render(
      <AssistantConversation
        {...baseProps}
        error={new Error('Network unavailable')}
        messages={[
          {
            id: 'msg-user',
            role: 'user',
            parts: [{ type: 'text', text: 'Summarize our open gaps.' }],
          },
        ]}
        onRetry={handleRetry}
        status="error"
      />,
    );

    expect(screen.getByText('Summarize our open gaps.')).toBeInTheDocument();
    expect(screen.getByText('Response failed')).toBeInTheDocument();
    expect(screen.getByText('Network unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let aiChatOpen = false;

vi.mock('@trycompai/design-system', () => ({
  useAppShell: () => ({ aiChatOpen }),
}));

vi.mock('./chat', () => ({
  Chat: () => <div data-testid="assistant-chat">Assistant chat</div>,
}));

import { LazyAssistantChat } from './lazy-assistant-chat';

describe('LazyAssistantChat', () => {
  beforeEach(() => {
    aiChatOpen = false;
  });

  it('does not render the assistant while its panel is closed', () => {
    render(<LazyAssistantChat />);

    expect(screen.queryByTestId('assistant-chat')).not.toBeInTheDocument();
  });

  it('loads the assistant after its panel opens', async () => {
    aiChatOpen = true;
    render(<LazyAssistantChat />);

    expect(await screen.findByTestId('assistant-chat')).toBeInTheDocument();
  });
});

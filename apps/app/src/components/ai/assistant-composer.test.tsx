import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AssistantComposer } from './assistant-composer';

describe('AssistantComposer', () => {
  it('submits a non-empty prompt with a visible send button', () => {
    const handleSubmitMessage = vi.fn();

    render(
      <AssistantComposer
        input="Summarize open gaps"
        isLoading={false}
        onInputChange={vi.fn()}
        onStop={vi.fn()}
        onSubmitMessage={handleSubmitMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(handleSubmitMessage).toHaveBeenCalledTimes(1);
  });

  it('submits with Enter but keeps Shift+Enter for new lines', () => {
    const handleSubmitMessage = vi.fn();

    render(
      <AssistantComposer
        input="Summarize open gaps"
        isLoading={false}
        onInputChange={vi.fn()}
        onStop={vi.fn()}
        onSubmitMessage={handleSubmitMessage}
      />,
    );

    const textbox = screen.getByPlaceholderText('Ask Betayum something...');

    fireEvent.keyDown(textbox, { key: 'Enter', shiftKey: true });
    expect(handleSubmitMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(textbox, { key: 'Enter' });
    expect(handleSubmitMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps typing available and exposes stop while a response is active', () => {
    const handleInputChange = vi.fn();
    const handleStop = vi.fn();
    const handleSubmitMessage = vi.fn();

    render(
      <AssistantComposer
        input="Next thought"
        isLoading
        onInputChange={handleInputChange}
        onStop={handleStop}
        onSubmitMessage={handleSubmitMessage}
      />,
    );

    const textbox = screen.getByPlaceholderText('Ask Betayum something...');

    expect(textbox).not.toBeDisabled();
    fireEvent.change(textbox, { target: { value: 'Next thought.' } });
    expect(handleInputChange).toHaveBeenCalledWith('Next thought.');

    fireEvent.keyDown(textbox, { key: 'Enter' });
    expect(handleSubmitMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    expect(handleStop).toHaveBeenCalledTimes(1);
  });
});

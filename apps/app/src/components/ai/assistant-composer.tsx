'use client';

import type { FormEvent, KeyboardEvent } from 'react';

type AssistantComposerProps = {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmitMessage: () => void;
};

export function AssistantComposer({
  input,
  isLoading,
  onInputChange,
  onSubmitMessage,
}: AssistantComposerProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim()) return;
    onSubmitMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;

    event.preventDefault();
    if (!input.trim() || isLoading) return;

    const form = event.currentTarget.closest('form');
    form?.requestSubmit();
  };

  return (
    <form className="mx-auto w-full max-w-xl px-4 py-2" onSubmit={handleSubmit}>
      <div className="relative">
        <textarea
          className="mb-2 h-12 min-h-12 w-full resize-none rounded-md border bg-background px-3 pt-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={input}
          autoFocus
          placeholder="Ask Betayum something..."
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </form>
  );
}

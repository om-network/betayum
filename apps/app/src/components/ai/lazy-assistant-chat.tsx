'use client';

import { useAppShell } from '@trycompai/design-system';
import { lazy, Suspense } from 'react';

const AssistantChat = lazy(async () => {
  const { Chat } = await import('./chat');
  return { default: Chat };
});

export function LazyAssistantChat() {
  const { aiChatOpen } = useAppShell();

  if (!aiChatOpen) return null;

  return (
    <Suspense fallback={null}>
      <AssistantChat />
    </Suspense>
  );
}

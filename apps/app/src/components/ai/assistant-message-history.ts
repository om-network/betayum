import type { UIMessage } from 'ai';

export type AssistantStoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
};

export function assistantStoredMessagesToUiMessages(
  messages: AssistantStoredMessage[],
): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: 'text', text: message.text }],
  }));
}

export function uiMessagesToAssistantStoredMessages({
  messages,
  createdAt,
}: {
  messages: UIMessage[];
  createdAt: number;
}): AssistantStoredMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return [];

    const text = message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n\n');

    if (text.trim().length === 0) return [];

    return {
      id: message.id,
      role: message.role,
      text,
      createdAt,
    };
  });
}

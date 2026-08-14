import type { UIMessage } from 'ai';

export function includeAssistantCommand({
  clientRequestId,
  messages,
  text,
}: {
  clientRequestId: string;
  messages: UIMessage[];
  text: string;
}): UIMessage[] {
  if (messages.some((message) => message.id === clientRequestId)) return messages;
  return [
    ...messages,
    {
      id: clientRequestId,
      role: 'user',
      parts: [{ type: 'text', text }],
    },
  ];
}

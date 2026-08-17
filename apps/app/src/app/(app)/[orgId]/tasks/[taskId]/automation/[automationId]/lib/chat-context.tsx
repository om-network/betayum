'use client';

import { apiClient } from '@/lib/api-client';
import { Chat } from '@ai-sdk/react';
import type { ChatTransport, UIMessageChunk } from 'ai';
import { useParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { type ChatUIMessage } from '../components/chat/types';
import { ensureUniqueChatMessageIds } from './unique-chat-messages';

interface ChatContextValue {
  chat: Chat<ChatUIMessage>;
  updateAutomationId: (newId: string) => void;
  automationIdRef: React.MutableRefObject<string>;
  autoTriggeredRef: React.MutableRefObject<boolean>;
  assistantStatus: string | null;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

function messageText(message: ChatUIMessage | undefined) {
  return (
    message?.parts
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n') ?? ''
  );
}

export function ChatProvider({
  children,
  initialMessages = [],
}: {
  children: ReactNode;
  initialMessages?: ChatUIMessage[];
}) {
  const { orgId, taskId, automationId } = useParams<{
    orgId: string;
    taskId: string;
    automationId: string;
  }>();
  const automationIdRef = useRef(automationId);
  const autoTriggeredRef = useRef(false);
  const manuallyUpdatedRef = useRef(false);
  const chatRef = useRef<Chat<ChatUIMessage> | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);

  if (!manuallyUpdatedRef.current) automationIdRef.current = automationId;

  const updateAutomationId = useCallback((newId: string) => {
    automationIdRef.current = newId;
    manuallyUpdatedRef.current = true;
  }, []);

  if (!chatRef.current) {
    const transport: ChatTransport<ChatUIMessage> = {
      reconnectToStream: async () => null,
      sendMessages: async ({ body, messageId, messages }) => {
        const currentAutomationId =
          body && 'automationId' in body && typeof body.automationId === 'string'
            ? body.automationId
            : automationIdRef.current;
        const latest = messages.at(-1);
        const response = await apiClient.post(
          `/v1/tasks/${taskId}/automations/${currentAutomationId}/assistant/messages`,
          {
            clientRequestId: messageId ?? latest?.id ?? crypto.randomUUID(),
            text: messageText(latest),
          },
          orgId,
        );
        if (response.error) throw new Error(response.error);
        return new ReadableStream<UIMessageChunk>({ start: (controller) => controller.close() });
      },
    };
    chatRef.current = new Chat<ChatUIMessage>({
      messages: ensureUniqueChatMessageIds(initialMessages),
      onError: (error) => toast.error(`Communication error with the AI: ${error.message}`),
      transport,
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const currentAutomationId = automationIdRef.current;
      if (currentAutomationId === 'new') return;
      const response = await apiClient.get<{
        success: boolean;
        data: { messages: ChatUIMessage[] };
      }>(`/v1/tasks/${taskId}/automations/${currentAutomationId}/chat-history?limit=100`, orgId);
      if (!cancelled && response.data?.data.messages) {
        chatRef.current!.messages = ensureUniqueChatMessageIds(response.data.data.messages);
      }
      const runResponse = await apiClient.get<{ status: string }>(
        `/v1/tasks/${taskId}/automations/${currentAutomationId}/assistant/run`,
        orgId,
      );
      if (!cancelled) setAssistantStatus(runResponse.data?.status ?? null);
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [orgId, taskId]);

  const value = useMemo(
    () => ({
      assistantStatus,
      chat: chatRef.current!,
      updateAutomationId,
      automationIdRef,
      autoTriggeredRef,
    }),
    [assistantStatus, updateAutomationId],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useSharedChatContext() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useSharedChatContext must be used within a ChatProvider');
  return context;
}

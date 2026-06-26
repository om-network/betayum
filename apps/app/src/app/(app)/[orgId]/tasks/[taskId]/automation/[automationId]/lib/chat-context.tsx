'use client';

import { Chat } from '@ai-sdk/react';
import { DataUIPart, DefaultChatTransport } from 'ai';
import { useParams } from 'next/navigation';
import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { saveChatHistory } from '../actions/task-automation-actions';
import { type ChatUIMessage } from '../components/chat/types';
import { getAutomationChatErrorMessage } from './chat-error-message';
import { useTaskAutomationDataMapper } from './task-automation-store';
import { DataPart } from './types/data-parts';

interface ChatContextValue {
  chat: Chat<ChatUIMessage>;
  updateAutomationId: (newId: string) => void;
  automationIdRef: React.MutableRefObject<string>;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({
  children,
  initialMessages = [],
}: {
  children: ReactNode;
  initialMessages?: ChatUIMessage[];
}) {
  const mapDataToState = useTaskAutomationDataMapper();
  const mapDataToStateRef = useRef(mapDataToState);
  mapDataToStateRef.current = mapDataToState;

  const url = '/api/tasks-automations/chat';

  const { taskId, automationId } = useParams<{
    taskId: string;
    automationId: string;
  }>();

  // Use ref to track the latest automation ID (important for ephemeral → real transition)
  // Initialize once, don't overwrite on every render
  const automationIdRef = useRef(automationId);
  const hasBeenManuallyUpdated = useRef(false);
  const isSavingRef = useRef(false);

  // Only update from params if it hasn't been manually set
  if (!hasBeenManuallyUpdated.current) {
    automationIdRef.current = automationId;
  }

  // Function to update automation ID (called when ephemeral becomes real)
  const updateAutomationId = useCallback((newId: string) => {
    automationIdRef.current = newId;
    hasBeenManuallyUpdated.current = true;
  }, []);

  // Create Chat instance once with initial messages
  const chatRef = useRef<Chat<ChatUIMessage> | null>(null);
  if (!chatRef.current) {
    chatRef.current = new Chat<ChatUIMessage>({
      transport: new DefaultChatTransport({
        api: url,
      }),
      messages: initialMessages,
      onToolCall: () => mutate(`/api/auth/info`),
      onData: (data) => mapDataToStateRef.current(data as DataUIPart<DataPart>),
      onError: (error) => {
        toast.error(getAutomationChatErrorMessage(error.message));
        console.error('Error sending message:', error);
      },
      onFinish: async (event) => {
        // Guard against concurrent saves
        if (isSavingRef.current) {
          return;
        }

        // Get the current automation ID from ref (handles URL updates via replaceState)
        const currentAutomationId = automationIdRef.current;

        if (currentAutomationId === 'new') {
          return;
        }

        isSavingRef.current = true;
        try {
          const messagesToSave = event.messages;
          await saveChatHistory({
            taskId,
            automationId: currentAutomationId,
            messages: messagesToSave || [],
          });
        } finally {
          isSavingRef.current = false;
        }
      },
    });
  }

  return (
    <ChatContext.Provider value={{ chat: chatRef.current, updateAutomationId, automationIdRef }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useSharedChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useSharedChatContext must be used within a ChatProvider');
  }
  return context;
}

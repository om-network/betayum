'use client';

import { env } from '@/env.mjs';
import { apiClient } from '@/lib/api-client';
import { useActiveOrganization, useSession } from '@/utils/auth-client';
import { useChat } from '@ai-sdk/react';
import { Button } from '@trycompai/design-system';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import type { UIMessage } from 'ai';
import { useParams } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { AssistantComposer } from './assistant-composer';
import { AssistantConversation } from './assistant-conversation';
import {
  assistantStoredMessagesToUiMessages,
  uiMessagesToAssistantStoredMessages,
} from './assistant-message-history';
import type { AssistantStoredMessage } from './assistant-message-history';

const API_URL = env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

export function Chat() {
  const { data: session } = useSession();
  const { data: activeOrganization } = useActiveOrganization();
  const params = useParams();

  const [input, setInput] = useState('');
  const [isHydrating, setIsHydrating] = useState(false);

  const userId = session?.user?.id;
  const orgIdFromUrl =
    typeof params?.orgId === 'string'
      ? params.orgId
      : Array.isArray(params?.orgId)
        ? params.orgId[0]
        : undefined;

  const resolvedOrganizationId = orgIdFromUrl ?? activeOrganization?.id;

  const lastSavedJsonRef = useRef<string>('');
  const isHydratingRef = useRef<boolean>(false);
  const latestSnapshotRef = useRef<{
    organizationId: string;
    messages: AssistantStoredMessage[];
  } | null>(null);
  const resolvedOrganizationIdRef = useRef<string | undefined>(resolvedOrganizationId);

  useEffect(() => {
    resolvedOrganizationIdRef.current = resolvedOrganizationId;
  }, [resolvedOrganizationId]);

  const transport = new DefaultChatTransport<UIMessage>({
    api: `${API_URL}/v1/assistant-chat/completions`,
    credentials: 'include',
  });

  const { messages, sendMessage, error, status, stop, setMessages } = useChat({
    id:
      resolvedOrganizationId && userId
        ? `assistant-chat:v1:${resolvedOrganizationId}:${userId}`
        : undefined,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Hydrate chat messages from server-side (Redis-backed) history.
  useEffect(() => {
    if (!userId || !resolvedOrganizationId) return;

    isHydratingRef.current = true;
    setIsHydrating(true);
    setMessages([]);

    const controller = new AbortController();
    const orgIdAtStart = resolvedOrganizationId;

    void (async () => {
      const res = await apiClient.get<{ messages: AssistantStoredMessage[] }>(
        '/v1/assistant-chat/history',
      );

      if (res.error || res.status !== 200) {
        console.error('[assistant-chat] Failed to load history', {
          status: res.status,
          error: res.error,
        });
      }

      if (resolvedOrganizationIdRef.current !== orgIdAtStart) {
        isHydratingRef.current = false;
        setIsHydrating(false);
        return;
      }

      const stored = res.data?.messages ?? [];
      latestSnapshotRef.current = { organizationId: orgIdAtStart, messages: stored };
      lastSavedJsonRef.current = JSON.stringify(stored);

      setMessages(assistantStoredMessagesToUiMessages(stored));
      isHydratingRef.current = false;
      setIsHydrating(false);
    })();

    return () => {
      controller.abort();
    };
  }, [resolvedOrganizationId, setMessages, userId]);

  useEffect(() => {
    if (!resolvedOrganizationId || !userId) return;
    if (isHydratingRef.current) return;

    const storedMessages = uiMessagesToAssistantStoredMessages({
      messages,
      createdAt: Date.now(),
    });

    const json = JSON.stringify(storedMessages);
    if (json === lastSavedJsonRef.current) return;
    lastSavedJsonRef.current = json;
    if (resolvedOrganizationId) {
      latestSnapshotRef.current = {
        organizationId: resolvedOrganizationId,
        messages: storedMessages,
      };
    }

    const delayMs = isLoading ? 300 : 0;
    const timeout = window.setTimeout(() => {
      void apiClient.call(
        '/v1/assistant-chat/history',
        {
          method: 'PUT',
          body: JSON.stringify({ messages: storedMessages }),
        },
      );
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [isLoading, messages, resolvedOrganizationId, userId]);

  // Flush the latest history snapshot on unmount.
  useEffect(() => {
    if (!resolvedOrganizationId || !userId) return;

    return () => {
      const snapshot = latestSnapshotRef.current;
      if (!snapshot || snapshot.messages.length === 0) return;

      void apiClient.call(
        '/v1/assistant-chat/history',
        {
          method: 'PUT',
          body: JSON.stringify({ messages: snapshot.messages }),
          keepalive: true,
        },
      );
    };
  }, [resolvedOrganizationId, userId]);

  const isStreaming = status === 'streaming';
  const firstName = session?.user?.name?.split(' ').at(0) ?? '';

  const handleSubmitMessage = () => {
    if (!input.trim()) return;

    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-xl items-center justify-end gap-2 px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading || messages.length === 0 || !resolvedOrganizationId || !userId}
          onClick={() => {
            if (!resolvedOrganizationId || !userId) return;
            void apiClient.delete('/v1/assistant-chat/history');
            setMessages([]);
            setInput('');
          }}
        >
          Clear chat
        </Button>
      </div>

      <AssistantConversation
        error={error}
        firstName={firstName}
        isHydrating={isHydrating}
        isStreaming={isStreaming}
        messages={messages}
        status={status}
      />

      <AssistantComposer
        input={input}
        isLoading={isLoading}
        onInputChange={setInput}
        onSubmitMessage={handleSubmitMessage}
      />
    </div>
  );
}

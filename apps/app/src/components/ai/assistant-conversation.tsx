'use client';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import type { UIMessage } from 'ai';
import { LogoSpinner } from '../logo-spinner';
import { AssistantMessageParts } from './assistant-message-parts';

type AssistantConversationProps = {
  error: Error | undefined;
  firstName: string;
  isStreaming: boolean;
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
};

export function AssistantConversation({
  error,
  firstName,
  isStreaming,
  messages,
  status,
}: AssistantConversationProps) {
  return (
    <Conversation className="flex-1">
      <ConversationContent className="mx-auto max-w-xl !gap-6">
        {error && (
          <div className="px-4 py-2">
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error.message}
            </div>
          </div>
        )}
        {messages.length === 0 && !error ? (
          <ConversationEmptyState
            icon={<LogoSpinner />}
            title={`Hi ${firstName}, how can I help you today?`}
          />
        ) : (
          messages.map((message, index) => (
            <Message from={message.role} key={message.id}>
              {message.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5">
                    <MessageContent>
                      <AssistantMessageParts
                        message={message}
                        isLastMessage={index === messages.length - 1}
                        isStreaming={isStreaming}
                      />
                    </MessageContent>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center text-foreground">
                      <LogoSpinner size={16} isDisabled={false} />
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      Betayum
                    </span>
                  </div>
                  <MessageContent className="pl-7">
                    <AssistantMessageParts
                      message={message}
                      isLastMessage={index === messages.length - 1}
                      isStreaming={isStreaming}
                    />
                  </MessageContent>
                </>
              )}
            </Message>
          ))
        )}
        {status === 'submitted' && <LogoSpinner />}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

'use client';

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool';
import { isToolUIPart } from 'ai';
import type { UIMessage } from 'ai';
import { MessageResponse } from '../ai-elements/message';

type AssistantMessagePartsProps = {
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
};

export function AssistantMessageParts({
  message,
  isLastMessage,
  isStreaming,
}: AssistantMessagePartsProps) {
  const reasoningParts = message.parts.filter((part) => part.type === 'reasoning');
  const reasoningText = reasoningParts.map((part) => part.text).join('\n\n');
  const hasReasoning = reasoningParts.length > 0;
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isLastMessage && isStreaming && lastPart?.type === 'reasoning';

  return (
    <>
      {hasReasoning && (
        <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      )}
      {message.parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <MessageResponse key={`${message.id}-${index}`}>
              {part.text}
            </MessageResponse>
          );
        }

        if (!isToolUIPart(part)) return null;
        if (part.state === 'output-available') return null;

        if (part.type === 'dynamic-tool') {
          return (
            <Tool key={`${message.id}-tool-${index}`}>
              <ToolHeader
                type={part.type}
                state={part.state}
                toolName={part.toolName}
              />
              <ToolContent />
            </Tool>
          );
        }

        return (
          <Tool key={`${message.id}-tool-${index}`}>
            <ToolHeader type={part.type} state={part.state} />
            <ToolContent />
          </Tool>
        );
      })}
    </>
  );
}

import { db } from '@db';
import { NotFoundException } from '@nestjs/common';
import type { AutomationAuditService } from './automation-audit.service';
import type {
  AutomationActor,
  ScopedAutomationParams,
} from './automation-types';

export async function getAutomationChatHistory({
  organizationId,
  taskId,
  automationId,
  offset = 0,
  limit = 50,
}: ScopedAutomationParams & { offset?: number; limit?: number }) {
  const automation = await findScopedAutomation({
    organizationId,
    taskId,
    automationId,
  });
  const messages = parseChatHistory(automation.chatHistory);
  const pagedMessages = messages.slice(offset, offset + limit);

  return {
    success: true,
    data: {
      messages: pagedMessages,
      total: messages.length,
      hasMore: offset + limit < messages.length,
    },
  };
}

export async function saveAutomationChatHistory({
  organizationId,
  taskId,
  automationId,
  messages,
  actor,
  auditService,
}: ScopedAutomationParams & {
  messages: unknown[];
  actor?: AutomationActor;
  auditService: AutomationAuditService;
}) {
  await findScopedAutomation({ organizationId, taskId, automationId });
  const normalizedMessages = ensureUniqueMessageIds(messages);
  await db.evidenceAutomation.update({
    where: { id: automationId },
    data: { chatHistory: JSON.stringify(normalizedMessages) },
  });

  if (actor) {
    await auditService.logAutomationEvent({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'draft_updated',
      description: 'updated automation chat draft',
    });
  }

  return { success: true };
}

async function findScopedAutomation({
  organizationId,
  taskId,
  automationId,
}: ScopedAutomationParams) {
  const automation = await db.evidenceAutomation.findFirst({
    where: {
      id: automationId,
      taskId,
      task: { organizationId },
    },
  });

  if (!automation) {
    throw new NotFoundException('Automation not found');
  }

  return automation;
}

function parseChatHistory(chatHistory: string | null): unknown[] {
  if (!chatHistory) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(chatHistory);
    return Array.isArray(parsed) ? ensureUniqueMessageIds(parsed) : [];
  } catch {
    return [];
  }
}

export function ensureUniqueMessageIds(messages: unknown[]): unknown[] {
  const usedIds = new Set<string>();
  const occurrences = new Map<string, number>();

  return messages.map((message) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('id' in message) ||
      typeof message.id !== 'string'
    ) {
      return message;
    }

    const originalId = message.id;
    let occurrence = (occurrences.get(originalId) ?? 0) + 1;
    occurrences.set(originalId, occurrence);
    if (!usedIds.has(originalId)) {
      usedIds.add(originalId);
      return message;
    }

    let uniqueId = `${originalId}--${occurrence}`;
    while (usedIds.has(uniqueId)) {
      occurrence += 1;
      occurrences.set(originalId, occurrence);
      uniqueId = `${originalId}--${occurrence}`;
    }
    usedIds.add(uniqueId);
    return { ...message, id: uniqueId };
  });
}

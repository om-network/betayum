import { serverApi } from '@/lib/api-server';
import type { EvidenceAutomation, Task } from '@db';
import { redirect } from 'next/navigation';
import { loadChatHistory } from './actions/task-automation-actions';
import { AutomationLayoutWrapper } from './automation-layout-wrapper';
import { AutomationPageClient } from './components/AutomationPageClient';
import type { ChatUIMessage } from './components/chat/types';
import { ChatProvider } from './lib/chat-context';
import { ensureUniqueChatMessageIds } from './lib/unique-chat-messages';

export default async function Page({
  params,
}: {
  params: Promise<{ taskId: string; orgId: string; automationId: string }>;
}) {
  const { taskId, orgId, automationId } = await params;
  let taskName: string;
  let taskDescription: string | undefined;
  if (automationId === 'new') {
    const taskResponse = await serverApi.get<Task>(`/v1/tasks/${taskId}`);
    const task = taskResponse.data;
    if (!task || taskResponse.error) redirect(`/${orgId}/tasks`);
    taskName = task.title;
    taskDescription = task.description || task.title;
  } else {
    const automationResponse = await serverApi.get<{
      success: boolean;
      automation: EvidenceAutomation;
    }>(`/v1/tasks/${taskId}/automations/${automationId}`);
    const automation = automationResponse.data?.automation;
    if (!automation || automationResponse.error) redirect(`/${orgId}/tasks`);
    taskName = automation.name;
  }

  // Load chat history server-side (skip for ephemeral 'new' automations)
  let initialMessages: ChatUIMessage[] = [];
  if (automationId !== 'new') {
    const historyResult = await loadChatHistory({ taskId, automationId });
    if (historyResult.success && historyResult.data?.messages) {
      initialMessages = ensureUniqueChatMessageIds(historyResult.data.messages);
    }
  }

  return (
    <ChatProvider initialMessages={initialMessages}>
      <AutomationLayoutWrapper>
        <div className="h-screen overflow-hidden">
          <AutomationPageClient
            orgId={orgId}
            taskId={taskId}
            automationId={automationId}
            taskName={taskName}
            taskDescription={taskDescription}
          />
        </div>
      </AutomationLayoutWrapper>
    </ChatProvider>
  );
}

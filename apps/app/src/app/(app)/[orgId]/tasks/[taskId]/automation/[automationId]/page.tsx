import { serverApi } from '@/lib/api-server';
import type { Task } from '@db';
import { redirect } from 'next/navigation';
import { loadChatHistory } from './actions/task-automation-actions';
import { AutomationLayoutWrapper } from './automation-layout-wrapper';
import { AutomationPageClient } from './components/AutomationPageClient';
import type { ChatUIMessage } from './components/chat/types';
import { ChatProvider } from './lib/chat-context';

export default async function Page({
  params,
}: {
  params: Promise<{ taskId: string; orgId: string; automationId: string }>;
}) {
  const { taskId, orgId, automationId } = await params;
  const taskResponse = await serverApi.get<Task>(`/v1/tasks/${taskId}`);
  const task = taskResponse.data;

  if (!task || taskResponse.error) {
    redirect(`/${orgId}/tasks`);
  }

  const taskName = task.title;

  // Load chat history server-side (skip for ephemeral 'new' automations)
  let initialMessages: ChatUIMessage[] = [];
  if (automationId !== 'new') {
    const historyResult = await loadChatHistory({ taskId, automationId });
    if (historyResult.success && historyResult.data?.messages) {
      // Deduplicate messages by ID (in case of concurrent save/load race conditions)
      const seen = new Set();
      initialMessages = historyResult.data.messages.filter((msg) => {
        if (seen.has(msg.id)) {
          return false;
        }
        seen.add(msg.id);
        return true;
      });
    }
  }

  const taskDescription = task.description || task.title;

  return (
    <ChatProvider initialMessages={initialMessages}>
      <AutomationLayoutWrapper>
        <div className="h-screen overflow-hidden">
          <AutomationPageClient
            orgId={orgId}
            taskId={taskId}
            automationId={automationId}
            taskName={taskName}
            taskDescription={automationId === 'new' ? taskDescription : undefined}
          />
        </div>
      </AutomationLayoutWrapper>
    </ChatProvider>
  );
}

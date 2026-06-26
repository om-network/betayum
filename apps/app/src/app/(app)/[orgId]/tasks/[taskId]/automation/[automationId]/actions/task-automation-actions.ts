'use server';

import { randomUUID } from 'crypto';
import type { ChatUIMessage } from '../components/chat/types';

type ChatHistoryMessage = ChatUIMessage;
type AutomationRunStatus = {
  id: string;
  status: string;
  success?: boolean | null;
  error?: string | null;
  output?: unknown;
  evaluationStatus?: 'fail' | 'pass' | null;
  evaluationReason?: string | null;
};

function getUnavailableResult(operation: string) {
  return {
    success: false as const,
    error: `${operation} is not available until first-party automation storage is configured.`,
    data: undefined,
  };
}

function getActionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Upload automation script
 */
export async function uploadAutomationScript(data: {
  orgId: string;
  taskId: string;
  content: string;
  type?: string;
  automationId?: string;
}) {
  if (!data.automationId) {
    return getUnavailableResult('Automation draft upload');
  }
  try {
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.put(
      `/v1/tasks/${data.taskId}/automations/${data.automationId}/draft-script`,
      { content: data.content },
    );
    if (response.error) throw new Error(response.error);
    const key = `first-party://${data.orgId}/${data.taskId}/${data.automationId}/draft`;
    return {
      success: true,
      error: undefined,
      data: { key, bucket: 'first-party', message: 'Script saved' },
    };
  } catch (error) {
    return {
      success: false as const,
      error: getActionError(error, 'Failed to upload script'),
      data: undefined,
    };
  }
}

/**
 * Get automation script
 */
export async function getAutomationScript(key: string) {
  const match = key.match(/^first-party:\/\/[^/]+\/([^/]+)\/([^/]+)\//);
  if (!match) {
    return getUnavailableResult('Automation script retrieval');
  }
  const [, taskId, automationId] = match;
  try {
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.get<{ success: boolean; content: string | null }>(
      `/v1/tasks/${taskId}/automations/${automationId}/draft-script`,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.content) {
      return { success: false as const, error: 'Script not found', data: undefined };
    }
    return {
      success: true,
      error: undefined,
      data: { content: response.data.content, key },
    };
  } catch (error) {
    return {
      success: false as const,
      error: getActionError(error, 'Failed to retrieve script'),
      data: undefined,
    };
  }
}

/**
 * List automation scripts
 */
export async function listAutomationScripts(orgId: string) {
  void orgId;
  return getUnavailableResult('Automation script listing');
}

/**
 * Execute automation script
 */
export async function executeAutomationScript(data: {
  orgId: string;
  taskId: string;
  automationId: string;
  version: number;
}) {
  if (!Number.isInteger(data.version) || data.version <= 0) {
    return {
      success: false as const,
      error: 'Select a published automation version before running it.',
      data: undefined,
    };
  }

  try {
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.post<{
      success: boolean;
      run: { id: string };
    }>(`/v1/tasks/${data.taskId}/automations/${data.automationId}/runs`, {
      version: data.version,
    });
    if (response.error) throw new Error(response.error);
    const runId = response.data?.run.id;
    if (!runId) throw new Error('Automation run was not created');

    return { success: true, data: { runId } };
  } catch (error) {
    return {
      success: false as const,
      error: getActionError(error, 'Failed to execute script'),
      data: undefined,
    };
  }
}

/**
 * Analyze workflow
 */
export async function analyzeAutomationWorkflow(scriptContent: string) {
  void scriptContent;
  return getUnavailableResult('Automation workflow analysis');
}

export const getAutomationRunStatus = async ({
  taskId,
  runId,
}: {
  taskId: string;
  runId: string;
}) => {
  try {
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.get<{
      success: boolean;
      run: AutomationRunStatus;
    }>(`/v1/tasks/${taskId}/automations/runs/${runId}`);
    if (response.error) throw new Error(response.error);
    if (!response.data?.run) throw new Error('Automation run was not found');

    const { run } = response.data;
    return {
      success: true,
      data: {
        id: run.id,
        status: run.status.toUpperCase(),
        error: run.error,
        output: {
          success: run.success ?? run.status === 'completed',
          error: run.error,
          output: isRecord(run.output) ? run.output : undefined,
          evaluationStatus: run.evaluationStatus ?? undefined,
          evaluationReason: run.evaluationReason ?? undefined,
        },
      },
    };
  } catch (error) {
    return {
      success: false as const,
      error: getActionError(error, 'Failed to fetch automation run status'),
      data: undefined,
    };
  }
};

/**
 * Load chat history for an automation
 */
export async function loadChatHistory({
  taskId,
  automationId,
  offset = 0,
  limit = 50,
}: {
  taskId: string;
  automationId: string;
  offset?: number;
  limit?: number;
}) {
  try {
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.get<{
      success: boolean;
      data: {
        messages: ChatHistoryMessage[];
        total: number;
        hasMore: boolean;
      };
    }>(
      `/v1/tasks/${taskId}/automations/${automationId}/chat-history?offset=${offset}&limit=${limit}`,
    );
    if (response.error) throw new Error(response.error);

    return {
      success: true,
      data: response.data?.data ?? {
        messages: [],
        total: 0,
        hasMore: false,
      },
    };
  } catch (error) {
    console.error('[loadChatHistory] Failed:', error);
    return {
      success: false as const,
      error: getActionError(error, 'Failed to load chat history'),
      data: undefined,
    };
  }
}

/**
 * Save chat history for an automation
 */
export async function saveChatHistory({
  taskId,
  automationId,
  messages,
}: {
  taskId: string;
  automationId: string;
  messages: unknown[];
}) {
  try {
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.post(
      `/v1/tasks/${taskId}/automations/${automationId}/chat-history`,
      { messages },
    );
    if (response.error) throw new Error(response.error);

    return {
      success: true,
    };
  } catch (error) {
    console.error('[saveChatHistory] Failed:', error);
    return {
      success: false,
      error: getActionError(error, 'Failed to save chat history'),
    };
  }
}

/**
 * Publish current draft as a new version
 */
export async function publishAutomation(
  orgId: string,
  taskId: string,
  automationId: string,
  changelog?: string,
) {
  try {
    const { serverApi } = await import('@/lib/api-server');
    const versionRes = await serverApi.post<{
      success: boolean;
      version: { version: number };
    }>(`/v1/tasks/${taskId}/automations/${automationId}/versions`, {
      scriptKey: getDraftSnapshotKey({ orgId, taskId, automationId }),
      changelog,
    });
    if (versionRes.error) throw new Error(versionRes.error);

    return {
      success: true,
      version: versionRes.data?.version,
    };
  } catch (error) {
    console.error('[publishAutomation] Failed:', error);
    return {
      success: false,
      error: getActionError(error, 'Failed to publish automation'),
    };
  }
}

function getDraftSnapshotKey({
  orgId,
  taskId,
  automationId,
}: {
  orgId: string;
  taskId: string;
  automationId: string;
}) {
  return `first-party://${orgId}/${taskId}/${automationId}/snapshots/${randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Restore a version to draft
 */
export async function restoreVersion(
  orgId: string,
  taskId: string,
  automationId: string,
  version: number,
) {
  try {
    void orgId;
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.post(
      `/v1/tasks/${taskId}/automations/${automationId}/versions/${version}/restore`,
      {},
    );
    if (response.error) throw new Error(response.error);

    return {
      success: true,
    };
  } catch (error) {
    console.error('[restoreVersion] Failed:', error);
    return {
      success: false,
      error: getActionError(error, 'Failed to restore version'),
    };
  }
}

/**
 * Update evaluation criteria for an automation.
 * Routes through NestJS API for RBAC + audit logging.
 */
export async function updateEvaluationCriteria(
  taskId: string,
  automationId: string,
  evaluationCriteria: string,
) {
  try {
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.patch(`/v1/tasks/${taskId}/automations/${automationId}`, {
      evaluationCriteria,
    });
    if (response.error) throw new Error(response.error);
    return { success: true };
  } catch (error) {
    console.error('[updateEvaluationCriteria] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update evaluation criteria',
    };
  }
}

/**
 * Toggle automation enabled state.
 * Routes through NestJS API for RBAC + audit logging.
 */
export async function toggleAutomationEnabled(
  taskId: string,
  automationId: string,
  isEnabled: boolean,
) {
  try {
    const { serverApi } = await import('@/lib/api-server');
    const response = await serverApi.patch(`/v1/tasks/${taskId}/automations/${automationId}`, {
      isEnabled,
    });
    if (response.error) throw new Error(response.error);
    return { success: true };
  } catch (error) {
    console.error('[toggleAutomationEnabled] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle automation',
    };
  }
}

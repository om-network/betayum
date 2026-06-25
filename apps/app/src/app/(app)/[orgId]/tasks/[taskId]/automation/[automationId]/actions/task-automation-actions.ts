'use server';

type ChatHistoryMessage = { id: string };

function getUnavailableResult(operation: string) {
  return {
    success: false,
    error: `${operation} is not available until first-party automation storage is configured.`,
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
}) {
  void data;
  return getUnavailableResult('Automation draft upload');
}

/**
 * Get automation script
 */
export async function getAutomationScript(key: string) {
  void key;
  return getUnavailableResult('Automation script retrieval');
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
  version?: number; // Optional: test specific version
}) {
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
      success: false,
      error: getActionError(error, 'Failed to execute script'),
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

export const getAutomationRunStatus = async (runId: string) => {
  void runId;
  return getUnavailableResult('Automation run status polling');
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
      success: false,
      error: getActionError(error, 'Failed to load chat history'),
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
  messages: ChatHistoryMessage[];
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
      scriptKey: `first-party://${orgId}/${taskId}/${automationId}/draft`,
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

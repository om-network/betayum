export interface TaskAutomationScope {
  organizationId: string;
  taskId: string;
}

export interface ScopedAutomationParams extends TaskAutomationScope {
  automationId: string;
}

export interface AutomationSecretRef {
  name: string;
  category?: string;
}

export interface AutomationActor {
  userId: string;
  memberId?: string | null;
}

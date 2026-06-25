import { Injectable, Logger } from '@nestjs/common';
import { db } from '@db';
import type {
  AutomationActor,
  AutomationSecretRef,
  ScopedAutomationParams,
} from './automation-types';

type AutomationAuditAction =
  | 'created'
  | 'draft_updated'
  | 'published'
  | 'manual_run_started'
  | 'run_completed'
  | 'run_failed'
  | 'enabled'
  | 'disabled'
  | 'restored'
  | 'secret_refs_used';

type AutomationAuditParams = ScopedAutomationParams & {
  actor: AutomationActor;
  action: AutomationAuditAction;
  description: string;
  runId?: string;
  version?: number;
  secretRefs?: AutomationSecretRef[];
};

@Injectable()
export class AutomationAuditService {
  private readonly logger = new Logger(AutomationAuditService.name);

  async logAutomationEvent(params: AutomationAuditParams) {
    try {
      await db.auditLog.create({
        data: {
          organizationId: params.organizationId,
          userId: params.actor.userId,
          memberId: params.actor.memberId ?? null,
          entityType: 'task',
          entityId: params.taskId,
          description: params.description,
          data: {
            action: params.action,
            automationId: params.automationId,
            taskId: params.taskId,
            path: this.getAutomationPath(params),
            ...(params.runId ? { runId: params.runId } : {}),
            ...(params.version ? { version: params.version } : {}),
            ...(params.secretRefs
              ? { secretRefs: this.getSecretNames(params.secretRefs) }
              : {}),
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to log automation activity:', error);
    }
  }

  private getAutomationPath({
    taskId,
    automationId,
  }: {
    taskId: string;
    automationId: string;
  }) {
    return `/tasks/${taskId}/automations/${automationId}`;
  }

  private getSecretNames(secretRefs: AutomationSecretRef[]) {
    return secretRefs.map((secretRef) => secretRef.name);
  }
}

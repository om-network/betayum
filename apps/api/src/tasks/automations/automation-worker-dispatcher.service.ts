import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { tasks } from '@trigger.dev/sdk/v3';
import type { AutomationExecutionRequest } from './automation-runtime.service';
import type { runEvidenceAutomation } from '../../trigger/tasks/run-evidence-automation';

@Injectable()
export class AutomationWorkerDispatcherService {
  async enqueue(request: AutomationExecutionRequest): Promise<void> {
    try {
      await tasks.trigger<typeof runEvidenceAutomation>(
        'run-evidence-automation',
        request,
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : 'Failed to enqueue automation run',
      );
    }
  }
}

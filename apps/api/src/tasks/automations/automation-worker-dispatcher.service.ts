import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AutomationExecutionRequest } from './automation-runtime.service';

@Injectable()
export class AutomationWorkerDispatcherService {
  async enqueue(request: AutomationExecutionRequest): Promise<void> {
    const queueUrl = process.env.TASK_AUTOMATION_WORKER_QUEUE_URL;

    if (!queueUrl) {
      throw new ServiceUnavailableException(
        'Task automation worker queue is not configured',
      );
    }

    const response = await fetch(queueUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Task automation worker queue rejected the run',
      );
    }
  }
}

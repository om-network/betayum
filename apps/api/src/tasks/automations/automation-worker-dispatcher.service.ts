import { Injectable } from '@nestjs/common';
import type { AutomationExecutionRequest } from './automation-runtime.service';
import { AutomationScriptExecutorService } from './automation-script-executor.service';

@Injectable()
export class AutomationWorkerDispatcherService {
  constructor(private readonly executor: AutomationScriptExecutorService) {}

  async enqueue(request: AutomationExecutionRequest): Promise<void> {
    await this.executor.executeInBackground(request);
  }
}

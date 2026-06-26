import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TasksModule } from '../tasks.module';
import { AutomationsController } from './automations.controller';
import { AutomationRunsController } from './automation-runs.controller';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationSecretsService } from './automation-secrets.service';
import { AutomationRuntimeService } from './automation-runtime.service';
import { AutomationUsageLimitsService } from './automation-usage-limits.service';
import { AutomationWorkerDispatcherService } from './automation-worker-dispatcher.service';
import { AutomationsService } from './automations.service';

@Module({
  imports: [AuthModule, forwardRef(() => TasksModule)],
  controllers: [AutomationsController, AutomationRunsController],
  providers: [
    AutomationsService,
    AutomationRuntimeService,
    AutomationUsageLimitsService,
    AutomationSecretsService,
    AutomationAuditService,
    AutomationWorkerDispatcherService,
  ],
  exports: [AutomationsService, AutomationRuntimeService],
})
export class AutomationsModule {}

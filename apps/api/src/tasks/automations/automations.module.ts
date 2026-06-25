import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TasksModule } from '../tasks.module';
import { AutomationsController } from './automations.controller';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationSecretsService } from './automation-secrets.service';
import { AutomationRuntimeService } from './automation-runtime.service';
import { AutomationUsageLimitsService } from './automation-usage-limits.service';
import { AutomationsService } from './automations.service';

@Module({
  imports: [AuthModule, forwardRef(() => TasksModule)],
  controllers: [AutomationsController],
  providers: [
    AutomationsService,
    AutomationRuntimeService,
    AutomationUsageLimitsService,
    AutomationSecretsService,
    AutomationAuditService,
  ],
  exports: [AutomationsService, AutomationRuntimeService],
})
export class AutomationsModule {}

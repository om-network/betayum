import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TasksModule } from '../tasks.module';
import { IntegrationPlatformModule } from '../../integration-platform/integration-platform.module';
import { AttachmentsModule } from '../../attachments/attachments.module';
import { AutomationsController } from './automations.controller';
import { AutomationRunsController } from './automation-runs.controller';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationSecretsService } from './automation-secrets.service';
import { AutomationRuntimeService } from './automation-runtime.service';
import { AutomationUsageLimitsService } from './automation-usage-limits.service';
import { AutomationScriptExecutorService } from './automation-script-executor.service';
import { AutomationWorkerDispatcherService } from './automation-worker-dispatcher.service';
import { AutomationsService } from './automations.service';
import { GoogleDocsService } from './google-docs.service';
import { GoogleSheetsService } from './google-sheets.service';
import { IntegrationBrowserModule } from '../../integration-browser/integration-browser.module';
import {
  CodexAutomationCallbackController,
  CodexAutomationController,
} from './codex-automation.controller';
import { CodexAutomationService } from './codex-automation.service';
import { AutomationContextController } from './automation-context.controller';
import { AutomationContextService } from './automation-context.service';
import { AutomationSetupQueueController } from './automation-setup-queue.controller';
import { AutomationSetupQueueService } from './automation-setup-queue.service';
import { AutomationAssistantService } from './automation-assistant.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => TasksModule),
    IntegrationPlatformModule,
    AttachmentsModule,
    IntegrationBrowserModule,
  ],
  controllers: [
    AutomationsController,
    AutomationRunsController,
    CodexAutomationController,
    CodexAutomationCallbackController,
    AutomationContextController,
    AutomationSetupQueueController,
  ],
  providers: [
    AutomationsService,
    AutomationRuntimeService,
    AutomationUsageLimitsService,
    AutomationSecretsService,
    AutomationAuditService,
    AutomationScriptExecutorService,
    AutomationWorkerDispatcherService,
    GoogleDocsService,
    GoogleSheetsService,
    CodexAutomationService,
    AutomationContextService,
    AutomationSetupQueueService,
    AutomationAssistantService,
  ],
  exports: [
    AutomationsService,
    AutomationRuntimeService,
    AutomationSetupQueueService,
  ],
})
export class AutomationsModule {}

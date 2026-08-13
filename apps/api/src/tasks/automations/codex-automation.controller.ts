import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { Public } from '../../auth/public.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { TasksService } from '../tasks.service';
import { CodexAutomationService } from './codex-automation.service';
import {
  CompleteCodexAutomationRunDto,
  CreateCodexAutomationRunDto,
  UploadCodexScreenshotDto,
} from './dto/codex-automation.dto';

@Controller({
  path: 'tasks/:taskId/automations/:automationId/codex-runs',
  version: '1',
})
@UseGuards(HybridAuthGuard, PermissionGuard)
export class CodexAutomationController {
  constructor(
    private readonly codexAutomation: CodexAutomationService,
    private readonly tasks: TasksService,
  ) {}

  @Post()
  @RequirePermission('task', 'update')
  async createRun(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Body() dto: CreateCodexAutomationRunDto,
  ) {
    await this.tasks.verifyTaskAccess(organizationId, taskId);
    return this.codexAutomation.createRun({
      automationId,
      dto,
      organizationId,
      taskId,
    });
  }

  @Get(':runId')
  @RequirePermission('task', 'read')
  async getRun(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('runId') runId: string,
  ) {
    await this.tasks.verifyTaskAccess(organizationId, taskId);
    return this.codexAutomation.getRun({ organizationId, runId, taskId });
  }
}

@Controller({ path: 'codex-automation', version: '1' })
@UseGuards(HybridAuthGuard)
export class CodexAutomationCallbackController {
  constructor(private readonly codexAutomation: CodexAutomationService) {}

  @Public()
  @Post('runs/:runId/screenshots')
  async uploadScreenshot(
    @Param('runId') runId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: UploadCodexScreenshotDto,
  ) {
    return this.codexAutomation.uploadScreenshot({
      authorization,
      dto,
      runId,
    });
  }

  @Public()
  @Post('runs/:runId/complete')
  async completeRun(
    @Param('runId') runId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CompleteCodexAutomationRunDto,
  ) {
    return this.codexAutomation.completeRun({
      authorization,
      dto,
      runId,
    });
  }
}

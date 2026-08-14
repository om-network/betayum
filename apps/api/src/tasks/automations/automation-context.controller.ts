import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { TasksService } from '../tasks.service';
import { AutomationContextService } from './automation-context.service';

@ApiTags('Task Automations')
@ApiSecurity('apikey')
@Controller({ path: 'tasks/:taskId/automation-context', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
export class AutomationContextController {
  constructor(
    private readonly context: AutomationContextService,
    private readonly tasks: TasksService,
  ) {}

  @Get()
  @RequirePermission('task', 'read')
  @ApiOperation({ summary: 'Get task-scoped automation context' })
  async getContext(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
  ) {
    await this.tasks.verifyTaskAccess(organizationId, taskId);
    return this.context.getContext({ organizationId, taskId });
  }

  @Post('attachments/:attachmentId/extract')
  @RequirePermission('task', 'read')
  @ApiOperation({ summary: 'Extract readable task attachment content' })
  async extractAttachment(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    await this.tasks.verifyTaskAccess(organizationId, taskId);
    return this.context.extractAttachment({
      attachmentId,
      organizationId,
      taskId,
    });
  }
}

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { TasksService } from '../tasks.service';
import { AutomationsService } from './automations.service';

@ApiTags('Task Automations')
@Controller({ path: 'tasks/:taskId/automations/runs', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AutomationRunsController {
  constructor(
    private readonly automationsService: AutomationsService,
    private readonly tasksService: TasksService,
  ) {}

  @Get(':runId')
  @RequirePermission('task', 'read')
  @ApiOperation({
    summary: 'Get automation run status',
    description: 'Retrieve a scoped automation run for status polling',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'runId', description: 'Automation run ID' })
  @ApiResponse({ status: 200, description: 'Run retrieved successfully' })
  async getAutomationRun(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('runId') runId: string,
  ) {
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.automationsService.findRunById({
      organizationId,
      taskId,
      runId,
    });
  }
}

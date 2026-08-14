import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../../auth/types';
import { AutomationSetupQueueService } from './automation-setup-queue.service';
import {
  FinalizeAutomationSetupDto,
  ResetAutomationSetupQueueDto,
  StartAutomationSetupQueueDto,
} from './dto/automation-setup-queue.dto';

@ApiTags('Task Automation Setup Queue')
@ApiSecurity('apikey')
@Controller({ path: 'task-automation-queue', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
export class AutomationSetupQueueController {
  constructor(private readonly queue: AutomationSetupQueueService) {}

  @Get()
  @RequirePermission('task', 'read')
  get(@OrganizationId() organizationId: string) {
    return this.queue.get(organizationId);
  }

  @Post()
  @RequirePermission('task', 'update')
  start(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() dto: StartAutomationSetupQueueDto,
  ) {
    if (!authContext.userId) {
      throw new BadRequestException(
        'An authenticated user is required to start the queue',
      );
    }
    return this.queue.start({
      organizationId,
      requestedByUserId: authContext.userId,
      taskIds: dto.taskIds,
    });
  }

  @Post('reset')
  @RequirePermission('task', 'update')
  reset(
    @OrganizationId() organizationId: string,
    @Body() dto: ResetAutomationSetupQueueDto,
  ) {
    return this.queue.reset({
      automationIds: dto.automationIds,
      organizationId,
    });
  }

  @Post(':taskId/finalize')
  @RequirePermission('task', 'update')
  finalize(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
    @Body() dto: FinalizeAutomationSetupDto,
  ) {
    if (!authContext.userId) {
      throw new BadRequestException(
        'An authenticated user is required to finalize setup',
      );
    }
    return this.queue.finalize({
      dto,
      organizationId,
      taskId,
      userId: authContext.userId,
    });
  }
}

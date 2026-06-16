import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApplyTaskLinksDto } from '../common/dto/apply-task-links.dto';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { RiskTaskLinksService } from './risk-task-links.service';

@ApiTags('Risks')
@Controller({ path: 'risks', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class RiskTaskLinksController {
  constructor(private readonly riskTaskLinksService: RiskTaskLinksService) {}

  @Post(':id/auto-link/apply')
  @RequirePermission('risk', 'update')
  async applyTaskLinks(
    @Param('id') riskId: string,
    @Body() body: ApplyTaskLinksDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.riskTaskLinksService.applyTaskLinks({
      riskId,
      organizationId,
      taskIds: body.taskIds,
      replace: body.replace ?? false,
    });
  }

  @Delete(':id/tasks/:taskId')
  @RequirePermission('risk', 'update')
  async unlinkTask(
    @Param('id') riskId: string,
    @Param('taskId') taskId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.riskTaskLinksService.unlinkTask({
      riskId,
      taskId,
      organizationId,
    });
  }
}

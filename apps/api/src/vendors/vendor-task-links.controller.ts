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
import { VendorTaskLinksService } from './vendor-task-links.service';

@ApiTags('Vendors')
@Controller({ path: 'vendors', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class VendorTaskLinksController {
  constructor(
    private readonly vendorTaskLinksService: VendorTaskLinksService,
  ) {}

  @Post(':id/auto-link/apply')
  @RequirePermission('vendor', 'update')
  async applyTaskLinks(
    @Param('id') vendorId: string,
    @Body() body: ApplyTaskLinksDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.vendorTaskLinksService.applyTaskLinks({
      vendorId,
      organizationId,
      taskIds: body.taskIds,
      replace: body.replace ?? false,
    });
  }

  @Delete(':id/tasks/:taskId')
  @RequirePermission('vendor', 'update')
  async unlinkTask(
    @Param('id') vendorId: string,
    @Param('taskId') taskId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.vendorTaskLinksService.unlinkTask({
      vendorId,
      taskId,
      organizationId,
    });
  }
}

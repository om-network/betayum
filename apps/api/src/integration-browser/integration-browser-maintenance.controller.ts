import { Controller, Post, UseGuards } from '@nestjs/common';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { BrowserVmLifecycleService } from './browser-vm-lifecycle.service';

@Controller({ path: 'integration-browser/maintenance', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
export class IntegrationBrowserMaintenanceController {
  constructor(private readonly vmLifecycle: BrowserVmLifecycleService) {}

  @Post('stop-idle')
  @RequirePermission('integration', 'update')
  async stopIdle(
    @OrganizationId() organizationId: string,
  ): Promise<{ stopped: boolean }> {
    return {
      stopped: await this.vmLifecycle.stopIdleVm(organizationId),
    };
  }
}

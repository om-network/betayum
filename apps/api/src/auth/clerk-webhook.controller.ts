import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrganizationId } from './auth-context.decorator';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { PermissionGuard } from './permission.guard';
import { Public } from './public.decorator';
import { RequirePermission } from './require-permission.decorator';
import { ClerkReconciliationService } from './clerk-reconciliation.service';
import { verifyClerkWebhookPayload } from './clerk-reconciliation.helpers';

@ApiExcludeController()
@Controller({ path: 'auth/clerk', version: '1' })
@UseGuards(HybridAuthGuard)
export class ClerkWebhookController {
  constructor(
    private readonly clerkReconciliation: ClerkReconciliationService,
  ) {}

  @Post('webhook')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive Clerk organization webhooks' })
  async webhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const event = verifyClerkWebhookPayload({
      rawBody: req.rawBody,
      headers,
    });

    return this.clerkReconciliation.handleWebhookEvent(event);
  }

  @Get('reconciliation')
  @UseGuards(PermissionGuard)
  @RequirePermission('organization', 'read')
  @ApiOperation({ summary: 'Report Clerk/local organization drift' })
  async reconciliation(@OrganizationId() organizationId: string) {
    return this.clerkReconciliation.reconcileOrganization(organizationId);
  }
}

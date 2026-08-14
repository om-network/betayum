import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OrganizationId, UserId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionOnlyGuard } from '../auth/session-only.guard';
import { CodexTerminalService } from './codex-terminal.service';
import { IntegrationBrowserService } from './integration-browser.service';
import type {
  BrowserConnectionStatus,
  BrowserViewerSessionResponse,
  CodexTerminalSessionResponse,
} from './integration-browser.types';

@ApiTags('Integration Browser')
@ApiSecurity('apikey')
@Controller({ path: 'integration-browser', version: '1' })
@UseGuards(HybridAuthGuard, SessionOnlyGuard, PermissionGuard)
export class IntegrationBrowserController {
  constructor(
    private readonly codexTerminalService: CodexTerminalService,
    private readonly integrationBrowserService: IntegrationBrowserService,
  ) {}

  @Get('connections/:connectionId')
  @RequirePermission('integration', 'read')
  @ApiOperation({ summary: 'Get organization browser status' })
  async getConnectionStatus(
    @Param('connectionId') connectionId: string,
    @OrganizationId() organizationId: string,
  ): Promise<BrowserConnectionStatus> {
    return this.integrationBrowserService.getConnectionStatus({
      connectionId,
      organizationId,
    });
  }

  @Post('connections/:connectionId/viewer-sessions')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Open an interactive browser session' })
  async createViewerSession(
    @Param('connectionId') connectionId: string,
    @OrganizationId() organizationId: string,
    @UserId() userId: string,
  ): Promise<BrowserViewerSessionResponse> {
    return this.integrationBrowserService.createViewerSession({
      connectionId,
      organizationId,
      userId,
    });
  }

  @Get('viewer-sessions/:sessionId')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Poll an interactive browser session' })
  async getViewerSession(
    @Param('sessionId') sessionId: string,
    @OrganizationId() organizationId: string,
    @UserId() userId: string,
  ): Promise<BrowserViewerSessionResponse> {
    return this.integrationBrowserService.reconcileViewerSession({
      sessionId,
      organizationId,
      userId,
    });
  }

  @Post('viewer-sessions/:sessionId/complete')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Confirm and save the interactive browser session' })
  async completeViewerSession(
    @Param('sessionId') sessionId: string,
    @OrganizationId() organizationId: string,
    @UserId() userId: string,
  ): Promise<BrowserViewerSessionResponse> {
    return this.integrationBrowserService.completeViewerSession({
      sessionId,
      organizationId,
      userId,
    });
  }

  @Post('connections/:connectionId/codex-sessions')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Open an interactive Codex terminal session' })
  async createCodexSession(
    @Param('connectionId') connectionId: string,
    @OrganizationId() organizationId: string,
    @UserId() userId: string,
  ): Promise<CodexTerminalSessionResponse> {
    return this.codexTerminalService.createSession({
      connectionId,
      organizationId,
      userId,
    });
  }

  @Get('codex-sessions/:sessionId')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Poll an interactive Codex terminal session' })
  async getCodexSession(
    @Param('sessionId') sessionId: string,
    @OrganizationId() organizationId: string,
    @UserId() userId: string,
  ): Promise<CodexTerminalSessionResponse> {
    return this.codexTerminalService.reconcileSession({
      sessionId,
      organizationId,
      userId,
    });
  }

  @Post('codex-sessions/:sessionId/logout')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Disconnect Codex from the organization VM' })
  async logoutCodex(
    @Param('sessionId') sessionId: string,
    @OrganizationId() organizationId: string,
    @UserId() userId: string,
  ): Promise<{ success: true }> {
    await this.codexTerminalService.logout({
      sessionId,
      organizationId,
      userId,
    });
    return { success: true };
  }

  @Delete('codex-sessions/:sessionId')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Cancel an interactive Codex terminal session' })
  async cancelCodexSession(
    @Param('sessionId') sessionId: string,
    @OrganizationId() organizationId: string,
    @UserId() userId: string,
  ): Promise<{ success: true }> {
    await this.codexTerminalService.cancel({
      sessionId,
      organizationId,
      userId,
    });
    return { success: true };
  }

  @Delete('viewer-sessions/:sessionId')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Cancel the interactive browser session' })
  async cancelViewerSession(
    @Param('sessionId') sessionId: string,
    @OrganizationId() organizationId: string,
    @UserId() userId: string,
  ): Promise<{ success: true }> {
    await this.integrationBrowserService.cancelViewerSession({
      sessionId,
      organizationId,
      userId,
    });
    return { success: true };
  }
}

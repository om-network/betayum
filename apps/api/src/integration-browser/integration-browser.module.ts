import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionOnlyGuard } from '../auth/session-only.guard';
import { BrowserVncProxyService } from './browser-vnc-proxy.service';
import { BrowserVmLifecycleService } from './browser-vm-lifecycle.service';
import { CodexSshService } from './codex-ssh.service';
import { CodexStatusService } from './codex-status.service';
import { CodexTerminalProxyService } from './codex-terminal-proxy.service';
import { CodexTerminalService } from './codex-terminal.service';
import { GcpComputeService } from './gcp-compute.service';
import { IntegrationBrowserAccessService } from './integration-browser-access.service';
import { IntegrationBrowserController } from './integration-browser.controller';
import { IntegrationBrowserMaintenanceController } from './integration-browser-maintenance.controller';
import { IntegrationBrowserService } from './integration-browser.service';

@Module({
  imports: [AuthModule],
  controllers: [
    IntegrationBrowserController,
    IntegrationBrowserMaintenanceController,
  ],
  providers: [
    BrowserVncProxyService,
    BrowserVmLifecycleService,
    CodexSshService,
    CodexStatusService,
    CodexTerminalProxyService,
    CodexTerminalService,
    GcpComputeService,
    IntegrationBrowserAccessService,
    IntegrationBrowserService,
    SessionOnlyGuard,
  ],
  exports: [
    BrowserVmLifecycleService,
    BrowserVncProxyService,
    CodexSshService,
    CodexTerminalProxyService,
  ],
})
export class IntegrationBrowserModule {}

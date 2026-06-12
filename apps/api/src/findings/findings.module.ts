import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimelinesModule } from '../timelines/timelines.module';
import { NovuService } from '../notifications/novu.service';
import { RolesModule } from '../roles/roles.module';
import { RolesService } from '../roles/roles.service';
import { FindingAuditService } from './finding-audit.service';
import { FindingNotifierService } from './finding-notifier.service';
import { FindingsController } from './findings.controller';
import { FindingsService } from './findings.service';

@Module({
  imports: [AuthModule, TimelinesModule, RolesModule],
  controllers: [FindingsController],
  providers: [
    FindingsService,
    FindingAuditService,
    FindingNotifierService,
    NovuService,
    { provide: 'RolesService', useExisting: RolesService },
  ],
  exports: [FindingsService, FindingAuditService],
})
export class FindingsModule {}

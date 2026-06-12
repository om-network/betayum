import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { RolesService } from '../roles/roles.service';
import { TrustEmailService } from './email.service';
import { NdaPdfService } from './nda-pdf.service';
import { PolicyPdfRendererService } from './policy-pdf-renderer.service';
import { TrustAccessController } from './trust-access.controller';
import { TrustAccessService } from './trust-access.service';
import { TrustPortalController } from './trust-portal.controller';
import { TrustPortalService } from './trust-portal.service';

@Module({
  imports: [AuthModule, AttachmentsModule, RolesModule],
  controllers: [TrustPortalController, TrustAccessController],
  providers: [
    TrustPortalService,
    TrustAccessService,
    NdaPdfService,
    TrustEmailService,
    PolicyPdfRendererService,
    { provide: 'RolesService', useExisting: RolesService },
  ],
  exports: [TrustPortalService, TrustAccessService],
})
export class TrustPortalModule {}

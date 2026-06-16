import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InternalVendorAutomationController } from './internal-vendor-automation.controller';
import { VendorTaskLinksController } from './vendor-task-links.controller';
import { VendorTaskLinksService } from './vendor-task-links.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuthModule],
  controllers: [
    VendorsController,
    InternalVendorAutomationController,
    VendorTaskLinksController,
  ],
  providers: [VendorsService, VendorTaskLinksService],
  exports: [VendorsService],
})
export class VendorsModule {}

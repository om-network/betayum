import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RiskTaskLinksController } from './risk-task-links.controller';
import { RiskTaskLinksService } from './risk-task-links.service';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';

@Module({
  imports: [AuthModule],
  controllers: [RisksController, RiskTaskLinksController],
  providers: [RisksService, RiskTaskLinksService],
  exports: [RisksService],
})
export class RisksModule {}

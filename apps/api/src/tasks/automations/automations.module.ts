import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TasksModule } from '../tasks.module';
import { AutomationsController } from './automations.controller';
import { AutomationRuntimeService } from './automation-runtime.service';
import { AutomationsService } from './automations.service';

@Module({
  imports: [AuthModule, forwardRef(() => TasksModule)],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationRuntimeService],
  exports: [AutomationsService, AutomationRuntimeService],
})
export class AutomationsModule {}

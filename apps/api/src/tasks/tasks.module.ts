import { Module, forwardRef } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { AutomationsModule } from './automations/automations.module';
import { TimelinesModule } from '../timelines/timelines.module';
import { NovuService } from '../notifications/novu.service';
import { RolesModule } from '../roles/roles.module';
import { RolesService } from '../roles/roles.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskNotifierService } from './task-notifier.service';

@Module({
  imports: [
    AuthModule,
    AttachmentsModule,
    forwardRef(() => AutomationsModule),
    TimelinesModule,
    RolesModule,
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskNotifierService,
    NovuService,
    { provide: 'RolesService', useExisting: RolesService },
  ],
  exports: [TasksService, TaskNotifierService],
})
export class TasksModule {}

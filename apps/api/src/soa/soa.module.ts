import { Module } from '@nestjs/common';
import { SOAController } from './soa.controller';
import { SOAService } from './soa.service';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { RolesService } from '../roles/roles.service';

@Module({
  imports: [AuthModule, RolesModule],
  controllers: [SOAController],
  providers: [
    SOAService,
    { provide: 'RolesService', useExisting: RolesService },
  ],
  exports: [SOAService],
})
export class SOAModule {}

import { Module, forwardRef } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { AdminProvisioningService } from './admin-provisioning.service';
import { AdminsController } from './admins.controller';
import { PanelsModule } from '../panels/panels.module';
import { TrafficModule } from '../traffic/traffic.module';

@Module({
  imports: [forwardRef(() => PanelsModule), TrafficModule],
  controllers: [AdminsController],
  providers: [AdminsService, AdminProvisioningService],
  exports: [AdminsService, AdminProvisioningService],
})
export class AdminsModule {}

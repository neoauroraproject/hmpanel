import { Module, forwardRef } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { AdminsController } from './admins.controller';
import { PanelsModule } from '../panels/panels.module';
import { TrafficModule } from '../traffic/traffic.module';

@Module({
  imports: [forwardRef(() => PanelsModule), TrafficModule],
  controllers: [AdminsController],
  providers: [AdminsService],
  exports: [AdminsService],
})
export class AdminsModule {}

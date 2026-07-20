import { Module, forwardRef } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { StatsGateway } from './stats.gateway';
import { PanelsModule } from '../panels/panels.module';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [forwardRef(() => PanelsModule)],
  controllers: [StatsController],
  providers: [StatsService, StatsGateway, MonitoringService],
  exports: [StatsService, MonitoringService],
})
export class StatsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { StatsGateway } from './stats.gateway';
import { PanelsModule } from '../panels/panels.module';
import { MonitoringService } from './monitoring.service';
import { TrafficModule } from '../traffic/traffic.module';

@Module({
  imports: [forwardRef(() => PanelsModule), TrafficModule],
  controllers: [StatsController],
  providers: [StatsService, StatsGateway, MonitoringService],
  exports: [StatsService, MonitoringService],
})
export class StatsModule {}

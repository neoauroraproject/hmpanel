import { Module, forwardRef } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { PanelsModule } from '../panels/panels.module';

import { StatsModule } from '../stats/stats.module';
import { RedisLockService } from '../common/utils/redis-lock.service';

@Module({
  imports: [PanelsModule, forwardRef(() => StatsModule)],
  controllers: [ClientsController],
  providers: [ClientsService, RedisLockService],
  exports: [ClientsService],
})
export class ClientsModule {}

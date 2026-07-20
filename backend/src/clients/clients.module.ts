import { Module, forwardRef } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { PanelsModule } from '../panels/panels.module';
import { StatsModule } from '../stats/stats.module';
import { RedisLockService } from '../common/utils/redis-lock.service';
import { ClientOutputService } from './output/client-output.service';
import { OutputCacheService } from './output/output-cache.service';

@Module({
  imports: [forwardRef(() => PanelsModule), forwardRef(() => StatsModule)],
  controllers: [ClientsController],
  providers: [
    ClientsService,
    RedisLockService,
    ClientOutputService,
    OutputCacheService,
  ],
  exports: [ClientsService, ClientOutputService],
})
export class ClientsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { PanelsModule } from '../panels/panels.module';

import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [PanelsModule, forwardRef(() => StatsModule)],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}

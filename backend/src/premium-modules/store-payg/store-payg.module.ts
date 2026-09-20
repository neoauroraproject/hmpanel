import { Module, forwardRef } from '@nestjs/common';
import { ClientsModule } from '../../clients/clients.module';
import { PanelsModule } from '../../panels/panels.module';
import { StoreModule } from '../store/store.module';
import { PaygController } from './payg.controller';
import { PaygService } from './payg.service';
import { PaygLimitSyncService, PaygWalletHookAdapter } from './payg-limit-sync.service';
import { PaygMeterService } from './payg-meter.service';
import { PaygMeterScheduler } from './payg-meter.scheduler';

@Module({
  imports: [
    ClientsModule,
    PanelsModule,
    forwardRef(() => StoreModule),
  ],
  controllers: [PaygController],
  providers: [
    PaygService,
    PaygLimitSyncService,
    PaygMeterService,
    PaygMeterScheduler,
    PaygWalletHookAdapter,
  ],
  exports: [
    PaygService,
    PaygLimitSyncService,
    PaygMeterService,
    PaygWalletHookAdapter,
  ],
})
export class StorePaygModule {}

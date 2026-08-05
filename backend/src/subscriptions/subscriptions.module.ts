import { Module, forwardRef } from '@nestjs/common';
import {
  SubscriptionsController,
  PublicSubController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { ClientsModule } from '../clients/clients.module';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [ClientsModule, forwardRef(() => PanelsModule)],
  controllers: [SubscriptionsController, PublicSubController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}

import { Module } from '@nestjs/common';
import {
  SubscriptionsController,
  PublicSubController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [ClientsModule],
  controllers: [SubscriptionsController, PublicSubController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}

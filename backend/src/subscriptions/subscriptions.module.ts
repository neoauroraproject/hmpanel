import { Module } from '@nestjs/common';
import { SubscriptionsController, PublicSubController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController, PublicSubController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}

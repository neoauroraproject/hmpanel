import { Module } from '@nestjs/common';
import { SubscriptionsController, PublicSubController, SubAssetsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController, PublicSubController, SubAssetsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}

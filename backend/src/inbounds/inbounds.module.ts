import { Module } from '@nestjs/common';
import { InboundsService } from './inbounds.service';
import { InboundsController } from './inbounds.controller';

@Module({
  controllers: [InboundsController],
  providers: [InboundsService],
})
export class InboundsModule {}

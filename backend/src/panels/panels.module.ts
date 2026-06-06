import { Module } from '@nestjs/common';
import { PanelsService } from './panels.service';
import { PanelsController } from './panels.controller';
import { PanelsScheduler } from './panels.scheduler';

@Module({
  controllers: [PanelsController],
  providers: [PanelsService, PanelsScheduler],
  exports: [PanelsService],
})
export class PanelsModule {}

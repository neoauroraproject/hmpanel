import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { AdminsController } from './admins.controller';
import { PanelsModule } from '../panels/panels.module';
import { StoreModule } from '../store/store.module';

@Module({
  imports: [PanelsModule, StoreModule],
  controllers: [AdminsController],
  providers: [AdminsService],
  exports: [AdminsService],
})
export class AdminsModule {}

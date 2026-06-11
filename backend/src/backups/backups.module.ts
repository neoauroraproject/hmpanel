import { Module } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { PanelsModule } from '../panels/panels.module';
import { SettingsModule } from '../settings/settings.module';
import { BackupsScheduler } from './backups.scheduler';

@Module({
  imports: [PanelsModule, SettingsModule],
  controllers: [BackupsController],
  providers: [BackupsService, BackupsScheduler],
  exports: [BackupsService],
})
export class BackupsModule {}

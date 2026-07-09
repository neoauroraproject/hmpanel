import { Module } from '@nestjs/common';
import { PluginsService } from './plugins.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [PluginsService],
})
export class PluginsModule {}

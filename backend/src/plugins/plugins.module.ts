import { Module, forwardRef } from '@nestjs/common';
import { PluginsService } from './plugins.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [PluginsService],
  exports: [PluginsService],
})
export class PluginsModule {}

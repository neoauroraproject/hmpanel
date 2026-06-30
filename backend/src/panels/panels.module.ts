import { Module, forwardRef } from '@nestjs/common';
import { PanelsService } from './panels.service';
import { PanelsController } from './panels.controller';
import { PanelsScheduler } from './panels.scheduler';
import { PanelCapabilitiesService } from './panel-capabilities.service';
import { ApiCapabilityResolver } from './api-capability.resolver';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [PanelsController],
  providers: [PanelsService, PanelsScheduler, PanelCapabilitiesService, ApiCapabilityResolver],
  exports: [PanelsService, PanelCapabilitiesService, ApiCapabilityResolver],
})
export class PanelsModule {}

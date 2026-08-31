import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { PanelsService } from './panels.service';
import { PanelsController } from './panels.controller';
import { PanelsScheduler } from './panels.scheduler';
import { PanelCapabilitiesService } from './panel-capabilities.service';
import { ApiCapabilityResolver } from './api-capability.resolver';
import { SettingsModule } from '../settings/settings.module';
import { ClientsModule } from '../clients/clients.module';
import { TrafficModule } from '../traffic/traffic.module';
import { PanelDriverRegistry } from './native/panel-driver.registry';
import { PanelOperationGate } from './native/panel-operation-gate';
import { NativePanelOrchestrator } from './native/native-panel.orchestrator';
import { XuiPanelDriver } from './native/xui-panel.driver';

@Module({
  imports: [
    forwardRef(() => SettingsModule),
    forwardRef(() => ClientsModule),
    TrafficModule,
  ],
  controllers: [PanelsController],
  providers: [
    PanelsService,
    PanelsScheduler,
    PanelCapabilitiesService,
    ApiCapabilityResolver,
    PanelDriverRegistry,
    PanelOperationGate,
    NativePanelOrchestrator,
    XuiPanelDriver,
  ],
  exports: [
    PanelsService,
    PanelCapabilitiesService,
    ApiCapabilityResolver,
    PanelDriverRegistry,
    PanelOperationGate,
    NativePanelOrchestrator,
  ],
})
export class PanelsModule implements OnModuleInit {
  constructor(
    private registry: PanelDriverRegistry,
    private xui: XuiPanelDriver,
  ) {}

  onModuleInit() {
    this.registry.register(this.xui);
  }
}

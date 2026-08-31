import { Injectable } from '@nestjs/common';
import type { PanelDriver, PanelSyncDriver } from './panel-driver.types';

@Injectable()
export class PanelDriverRegistry {
  private readonly drivers = new Map<string, PanelDriver>();
  private readonly syncDrivers = new Map<string, PanelSyncDriver>();

  register(driver: PanelDriver, sync?: PanelSyncDriver): void {
    this.drivers.set(driver.panelType, driver);
    if (sync) this.syncDrivers.set(sync.panelType, sync);
  }

  get(panelType: string | null | undefined): PanelDriver | undefined {
    if (!panelType) return this.drivers.get('3x-ui');
    return this.drivers.get(panelType);
  }

  getSync(panelType: string | null | undefined): PanelSyncDriver | undefined {
    if (!panelType) return this.syncDrivers.get('3x-ui');
    return this.syncDrivers.get(panelType);
  }

  has(panelType: string | null | undefined): boolean {
    return !!this.get(panelType);
  }

  hasSync(panelType: string | null | undefined): boolean {
    return !!this.getSync(panelType);
  }

  types(): string[] {
    return [...this.drivers.keys()];
  }
}

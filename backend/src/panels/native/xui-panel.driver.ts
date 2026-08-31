import { Injectable } from '@nestjs/common';
import { XUI_NATIVE_CAPABILITIES } from './native-panel-capabilities';
import type {
  DriverCreateClientInput,
  DriverUpdateClientInput,
  PanelCredentialsInput,
  PanelDriver,
  RemoteClientSnapshot,
  TestConnectionResult,
} from './panel-driver.types';

/**
 * 3x-ui driver is a capability + identity adapter.
 * Live client CRUD/sync stay in PanelsService/ClientsService (unchanged).
 */
@Injectable()
export class XuiPanelDriver implements PanelDriver {
  readonly panelType = '3x-ui' as const;

  capabilities() {
    return XUI_NATIVE_CAPABILITIES;
  }

  async testConnection(_creds: PanelCredentialsInput): Promise<TestConnectionResult> {
    return {
      ok: false,
      latencyMs: 0,
      capabilities: XUI_NATIVE_CAPABILITIES,
      error: 'Use PanelsService.testConnection for 3x-ui',
    };
  }

  async resolveRemoteIdentity(creds: PanelCredentialsInput): Promise<string> {
    try {
      const host = new URL(creds.apiBaseUrl).host;
      return `3x-ui:${host}`;
    } catch {
      return `3x-ui:${creds.apiBaseUrl}`;
    }
  }

  parseSubLink(): null {
    return null;
  }

  async listClients(): Promise<RemoteClientSnapshot[]> {
    throw new Error('3x-ui clients are listed from the local database');
  }

  async getClient(): Promise<RemoteClientSnapshot | null> {
    return null;
  }

  async createClient(
    _panelId: string,
    _input: DriverCreateClientInput,
  ): Promise<RemoteClientSnapshot> {
    throw new Error('3x-ui create stays on ClientsService');
  }

  async updateClient(
    _panelId: string,
    _username: string,
    _input: DriverUpdateClientInput,
  ): Promise<RemoteClientSnapshot> {
    throw new Error('3x-ui update stays on ClientsService');
  }

  async deleteClient(): Promise<void> {
    throw new Error('3x-ui delete stays on ClientsService');
  }
}

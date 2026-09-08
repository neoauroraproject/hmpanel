import { PanelDriverRegistry } from './panel-driver.registry';
import { PanelOperationRouter } from './panel-operation.router';
import type { PanelDriver } from './panel-driver.types';
import { XUI_NATIVE_CAPABILITIES } from './native-panel-capabilities';

function stubDriver(): PanelDriver {
  return {
    panelType: '3x-ui',
    capabilities: () => XUI_NATIVE_CAPABILITIES,
    testConnection: async () => ({
      ok: true,
      latencyMs: 1,
      capabilities: XUI_NATIVE_CAPABILITIES,
    }),
    resolveRemoteIdentity: async () => '3x-ui:test',
    parseSubLink: () => null,
    listClients: async () => [],
    getClient: async () => null,
    createClient: async (_panelId, input) => ({
      username: input.username,
      uuid: 'u1',
      enable: true,
      up: 0n,
      down: 0n,
      total: 0n,
      expiryTime: 0n,
    }),
    updateClient: async () => {
      throw new Error('unused');
    },
    deleteClient: async () => undefined,
  };
}

describe('PanelOperationRouter', () => {
  it('routes createClient to the registered driver', async () => {
    const registry = new PanelDriverRegistry();
    registry.register(stubDriver());
    const router = new PanelOperationRouter(registry);
    const created = await router.createClient('3x-ui', 'p1', { username: 'u' });
    expect(created.username).toBe('u');
  });
});

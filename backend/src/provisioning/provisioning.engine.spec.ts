import { ProvisioningEngine } from './provisioning.engine';
import { PolicyEngine } from '../authz/policy.engine';
import { PanelDriverRegistry } from '../panels/native/panel-driver.registry';
import type { PanelDriver } from '../panels/native/panel-driver.types';
import { XUI_NATIVE_CAPABILITIES } from '../panels/native/native-panel-capabilities';

function stubDriver(createImpl: PanelDriver['createClient']): PanelDriver {
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
    createClient: createImpl,
    updateClient: async () => {
      throw new Error('unused');
    },
    deleteClient: async () => undefined,
  };
}

describe('ProvisioningEngine', () => {
  it('reserves, creates, and commits', async () => {
    const registry = new PanelDriverRegistry();
    registry.register(
      stubDriver(async (_panelId, input) => ({
        username: input.username,
        uuid: 'u1',
        enable: true,
        up: 0n,
        down: 0n,
        total: 0n,
        expiryTime: 0n,
      })),
    );
    const engine = new ProvisioningEngine({ get: () => registry } as any, new PolicyEngine());
    const result = await engine.provisionUser({
      panelId: 'p1',
      panelType: '3x-ui',
      adminId: 'a1',
      maxClients: 10,
      currentClients: 0,
      client: { username: 'user1' },
    });
    expect(result.username).toBe('user1');
  });

  it('rolls back reservation when the adapter fails', async () => {
    const registry = new PanelDriverRegistry();
    registry.register(
      stubDriver(async () => {
        throw new Error('panel down');
      }),
    );
    const engine = new ProvisioningEngine({ get: () => registry } as any, new PolicyEngine());
    await expect(
      engine.provisionUser({
        panelId: 'p1',
        panelType: '3x-ui',
        adminId: 'a1',
        maxClients: 10,
        currentClients: 0,
        client: { username: 'user1' },
      }),
    ).rejects.toThrow('panel down');
  });
});

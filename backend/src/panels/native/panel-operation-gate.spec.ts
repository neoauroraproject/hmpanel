import { PanelOperationGate } from './panel-operation-gate';
import { PanelDriverRegistry } from './panel-driver.registry';

function mockFeatures(canWrite: boolean) {
  return { canWrite: jest.fn().mockResolvedValue(canWrite) } as any;
}

describe('PanelOperationGate', () => {
  it('always allows 3x-ui even when Premium is off', async () => {
    const registry = new PanelDriverRegistry();
    const gate = new PanelOperationGate(mockFeatures(false), registry);
    const d = await gate.decide({ panelType: '3x-ui', connectionHealth: 'CONNECTED' });
    expect(d.operable).toBe(true);
    expect(d.reason).toBe('ok');
  });

  it('freezes Eylan when Premium/module cannot write — does not require deleting data', async () => {
    const registry = new PanelDriverRegistry();
    const gate = new PanelOperationGate(mockFeatures(false), registry);
    const d = await gate.decide({ panelType: 'eylan', connectionHealth: 'CONNECTED' });
    expect(d.operable).toBe(false);
    expect(d.reason).toBe('premium_unavailable');
    expect(d.connectionHealth).toBe('CONNECTED');
  });

  it('freezes when driver is missing even if module is enabled', async () => {
    const registry = new PanelDriverRegistry();
    const gate = new PanelOperationGate(mockFeatures(true), registry);
    const d = await gate.decide({ panelType: 'pasarguard' });
    expect(d.operable).toBe(false);
    expect(d.reason).toBe('no_driver');
  });

  it('blocks manually DISABLED panels', async () => {
    const registry = new PanelDriverRegistry();
    registry.register(
      { panelType: 'eylan' } as any,
      { panelType: 'eylan' } as any,
    );
    const gate = new PanelOperationGate(mockFeatures(true), registry);
    const d = await gate.decide({ panelType: 'eylan', connectionHealth: 'DISABLED' });
    expect(d.operable).toBe(false);
    expect(d.reason).toBe('manually_disabled');
  });

  it('revives a DISABLED panel when the addon connection is still live', async () => {
    const registry = new PanelDriverRegistry();
    registry.register(
      { panelType: 'pasarguard' } as any,
      { panelType: 'pasarguard' } as any,
    );
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      storeAddonConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conn-1',
          enabled: false,
          apiBaseUrl: 'https://panel.example',
          apiKeyEnc: 'enc',
          lastTestOk: true,
        }),
        update: jest.fn().mockImplementation(async ({ data }) => {
          updates.push(data);
          return data;
        }),
      },
      panel: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const gate = new PanelOperationGate(mockFeatures(true), registry, prisma as any);
    const d = await gate.decide({
      id: 'panel-1',
      panelType: 'pasarguard',
      connectionHealth: 'DISABLED',
      connectionId: 'conn-1',
    });
    expect(d.operable).toBe(true);
    expect(d.reason).toBe('ok');
    expect(updates[0]).toMatchObject({ enabled: true });
    expect(prisma.panel.update).toHaveBeenCalled();
  });
});

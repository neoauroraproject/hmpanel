import {
  EYLAN_NATIVE_CAPABILITIES,
  PASARGUARD_NATIVE_CAPABILITIES,
  XUI_NATIVE_CAPABILITIES,
  capabilitiesForPanelType,
  isExternalPanelType,
  parseNativeCapabilities,
} from './native-panel-capabilities';

describe('native capability matrix (canonical API docs)', () => {
  it('treats only eylan/pasarguard as external', () => {
    expect(isExternalPanelType('3x-ui')).toBe(false);
    expect(isExternalPanelType('eylan')).toBe(true);
    expect(isExternalPanelType('pasarguard')).toBe(true);
  });

  it('hides Eylan CPU/RAM/disk and panel-DB backup (eylanapi.json)', () => {
    expect(EYLAN_NATIVE_CAPABILITIES.system.cpu).toBe(false);
    expect(EYLAN_NATIVE_CAPABILITIES.system.memory).toBe(false);
    expect(EYLAN_NATIVE_CAPABILITIES.system.disk).toBe(false);
    expect(EYLAN_NATIVE_CAPABILITIES.backup.database).toBe(false);
    expect(EYLAN_NATIVE_CAPABILITIES.clients.list).toBe(true);
    expect(EYLAN_NATIVE_CAPABILITIES.online.realtimeStream).toBe(false);
  });

  it('exposes Pasarguard system resources and hides getDb (pasarguard521.json)', () => {
    expect(PASARGUARD_NATIVE_CAPABILITIES.system.cpu).toBe(true);
    expect(PASARGUARD_NATIVE_CAPABILITIES.system.memory).toBe(true);
    expect(PASARGUARD_NATIVE_CAPABILITIES.backup.database).toBe(false);
    expect(PASARGUARD_NATIVE_CAPABILITIES.nodes.latency).toBe(true);
    expect(PASARGUARD_NATIVE_CAPABILITIES.clients.bulkEnable).toBe(true);
  });

  it('keeps 3x-ui getDb + CPU from api370.json', () => {
    expect(XUI_NATIVE_CAPABILITIES.backup.database).toBe(true);
    expect(XUI_NATIVE_CAPABILITIES.system.cpu).toBe(true);
    expect(XUI_NATIVE_CAPABILITIES.clients.bulkDelete).toBe(true);
  });

  it('parseNativeCapabilities does not invent true flags', () => {
    const parsed = parseNativeCapabilities({ system: { cpu: true } }, 'eylan');
    expect(parsed.system.cpu).toBe(true);
    expect(parsed.backup.database).toBe(false);
    expect(capabilitiesForPanelType('eylan').system.cpu).toBe(false);
  });
});

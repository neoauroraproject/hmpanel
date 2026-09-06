import { PANEL_CAPABILITY, flatCapabilitiesFor, hasCapability } from './panel-capability.catalog';

describe('flat panel capability catalog', () => {
  it('maps 3x-ui to inbounds + backup, not groups', () => {
    const caps = flatCapabilitiesFor('3x-ui');
    expect(caps.USERS).toBe(true);
    expect(caps.INBOUNDS).toBe(true);
    expect(caps.GROUPS).toBe(false);
    expect(caps.BACKUP).toBe(true);
    expect(caps.CLEANUP).toBe(true);
  });

  it('maps Eylan to instances, not inbounds/groups/backup', () => {
    const caps = flatCapabilitiesFor('eylan');
    expect(caps.INSTANCES).toBe(true);
    expect(caps.INBOUNDS).toBe(false);
    expect(caps.GROUPS).toBe(false);
    expect(caps.BACKUP).toBe(false);
    expect(caps.HWID).toBe(false);
    expect(hasCapability('eylan', PANEL_CAPABILITY.MONITORING)).toBe(true);
  });

  it('maps Pasarguard to groups + HWID, not 3x-ui inbounds', () => {
    const caps = flatCapabilitiesFor('pasarguard');
    expect(caps.GROUPS).toBe(true);
    expect(caps.INBOUNDS).toBe(false);
    expect(caps.HWID).toBe(true);
    expect(caps.BACKUP).toBe(false);
  });
});

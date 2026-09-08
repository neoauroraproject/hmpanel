import { parsePluginManifest } from './plugin-manifest';

describe('parsePluginManifest', () => {
  it('accepts an allowlisted declarative manifest', () => {
    const parsed = parsePluginManifest({
      id: 'notify.telegram',
      version: '1.0.0',
      name: 'Telegram notify',
      slots: ['notification.telegram'],
      permissions: ['events.read'],
    });
    expect(parsed.slots).toEqual(['notification.telegram']);
  });

  it('rejects arbitrary code permissions and unknown slots', () => {
    expect(() =>
      parsePluginManifest({
        id: 'evil',
        version: '1.0.0',
        slots: ['notification.sms'],
        permissions: ['child_process'],
      }),
    ).toThrow(/forbidden/);
    expect(() =>
      parsePluginManifest({
        id: 'empty-slots',
        version: '1.0.0',
        slots: ['not-a-slot'],
      }),
    ).toThrow(/slot/);
  });
});

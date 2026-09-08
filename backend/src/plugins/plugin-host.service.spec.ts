import { PluginHostService } from './plugin-host.service';
import { PluginSlotRegistry } from './plugin-slot.registry';
import { PLATFORM_FLAGS } from '../platform/architecture/feature-flags';

describe('PluginHostService', () => {
  const manifest = {
    id: 'notify.sms',
    version: '1.0.0',
    name: 'SMS',
    slots: ['notification.sms'],
    permissions: ['events.read'],
  };

  function host(flagOn: boolean) {
    const settings = new Map<string, string>();
    const prisma = {
      systemSetting: {
        findUnique: async ({ where }: { where: { key: string } }) => {
          const value = settings.get(where.key);
          return value ? { key: where.key, value } : null;
        },
        upsert: async ({
          where,
          update,
          create,
        }: {
          where: { key: string };
          update: { value: string };
          create: { value: string };
        }) => {
          settings.set(where.key, update.value || create.value);
        },
      },
    };
    const service = new PluginHostService(
      prisma as any,
      { isEnabled: async (flag: string) => flagOn && flag === PLATFORM_FLAGS.PLUGIN_HOST_V1 } as any,
      new PluginSlotRegistry(),
    );
    return { service, settings };
  }

  it('refuses install when the host flag is off', async () => {
    const { service } = host(false);
    await expect(service.install(manifest)).rejects.toThrow(/disabled/);
  });

  it('stores a declarative plugin and never executes server code', async () => {
    const { service } = host(true);
    const installed = await service.install(manifest);
    expect(installed.manifest.id).toBe('notify.sms');
    expect(installed.enabled).toBe(false);
    await service.setEnabled('notify.sms', true);
    await expect(service.execute('notify.sms', 'notification.sms', {})).rejects.toThrow(
      /cannot run server code/,
    );
  });
});

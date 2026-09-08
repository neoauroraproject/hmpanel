export const PLUGIN_SLOT_NAMES = [
  'payment.gateway',
  'notification.sms',
  'notification.whatsapp',
  'notification.telegram',
  'webhook.consumer',
  'analytics',
  'crm',
  'automation',
] as const;

export type PluginSlotName = (typeof PLUGIN_SLOT_NAMES)[number];

export type PluginManifest = {
  id: string;
  version: string;
  name: string;
  permissions: string[];
  configuration: Record<string, unknown>;
  dependencies: string[];
  slots: PluginSlotName[];
};

const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function parsePluginManifest(raw: unknown): PluginManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Plugin manifest must be an object');
  }
  const rec = raw as Record<string, unknown>;
  const id = String(rec.id || '').trim();
  const version = String(rec.version || '').trim();
  const name = String(rec.name || id).trim();
  if (!ID_RE.test(id)) throw new Error('Invalid plugin id');
  if (!VERSION_RE.test(version)) throw new Error('Invalid plugin version');
  const permissions = Array.isArray(rec.permissions)
    ? rec.permissions.map(String).filter(Boolean)
    : [];
  const dependencies = Array.isArray(rec.dependencies)
    ? rec.dependencies.map(String).filter(Boolean)
    : [];
  const slots = (Array.isArray(rec.slots) ? rec.slots.map(String) : []).filter(
    (slot): slot is PluginSlotName =>
      (PLUGIN_SLOT_NAMES as readonly string[]).includes(slot),
  );
  if (!slots.length) throw new Error('Plugin must declare at least one allowed slot');
  const configuration =
    rec.configuration && typeof rec.configuration === 'object' && !Array.isArray(rec.configuration)
      ? (rec.configuration as Record<string, unknown>)
      : {};
  if (permissions.some((p) => /eval|child_process|fs\.|sql/i.test(p))) {
    throw new Error('Plugin requested a forbidden permission');
  }
  return { id, version, name, permissions, configuration, dependencies, slots };
}

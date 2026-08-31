/**
 * Granular capability matrix locked to:
 * - Panel/docs/api370.json (3x-ui)
 * - Panel/docs/eylanapi.json (normalized_capabilities_for_multi_panel)
 * - Panel/docs/pasarguard521.json (PasarGuardAPI 5.2.1)
 *
 * not_confirmed_in_documentation → false (hide widget, never fake zeros).
 */

export const EXTERNAL_PANEL_TYPES = ['eylan', 'pasarguard'] as const;
export type ExternalPanelType = (typeof EXTERNAL_PANEL_TYPES)[number];
export type PanelProviderType = '3x-ui' | ExternalPanelType;

export const EXTERNAL_PANELS_MODULE_ID = 'external-panels';

export function isExternalPanelType(
  panelType: string | null | undefined,
): panelType is ExternalPanelType {
  return panelType === 'eylan' || panelType === 'pasarguard';
}

export function isXuiPanelType(panelType: string | null | undefined): boolean {
  return !panelType || panelType === '3x-ui';
}

export interface NativeClientCapabilities {
  list: boolean;
  get: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  toggle: boolean;
  resetTraffic: boolean;
  revokeSub: boolean;
  bulkCreate: boolean;
  bulkEnable: boolean;
  bulkDisable: boolean;
  bulkDelete: boolean;
  bulkResetTraffic: boolean;
}

export interface NativeClientFields {
  maxClients: boolean;
  hwidLimit: boolean;
  note: boolean;
  protocols: boolean;
}

export interface NativeSystemCapabilities {
  health: boolean;
  cpu: boolean;
  memory: boolean;
  disk: boolean;
  network: boolean;
  uptime: boolean;
}

export interface NativeNodeCapabilities {
  list: boolean;
  health: boolean;
  traffic: boolean;
  realtimeResources: boolean;
  latency: boolean;
}

export interface NativeBackupCapabilities {
  database: boolean;
  restore: boolean;
  catalogSnapshot: boolean;
}

export interface NativePanelCapabilities {
  clients: NativeClientCapabilities;
  clientFields: NativeClientFields;
  traffic: { perUser: boolean; aggregate: boolean };
  online: {
    userState: boolean;
    activeConnections: boolean;
    realtimeStream: boolean;
  };
  nodes: NativeNodeCapabilities;
  system: NativeSystemCapabilities;
  backup: NativeBackupCapabilities;
  subscriptions: { get: boolean; revoke: boolean; directConfigs: boolean };
  protocols: string[];
}

const CLIENTS_FULL: NativeClientCapabilities = {
  list: true,
  get: true,
  create: true,
  update: true,
  delete: true,
  toggle: true,
  resetTraffic: true,
  revokeSub: true,
  bulkCreate: true,
  bulkEnable: true,
  bulkDisable: true,
  bulkDelete: true,
  bulkResetTraffic: true,
};

export const XUI_NATIVE_CAPABILITIES: NativePanelCapabilities = {
  clients: { ...CLIENTS_FULL },
  clientFields: {
    maxClients: false,
    hwidLimit: true,
    note: false,
    protocols: false,
  },
  traffic: { perUser: true, aggregate: true },
  online: { userState: true, activeConnections: true, realtimeStream: false },
  nodes: {
    list: true,
    health: true,
    traffic: true,
    realtimeResources: false,
    latency: false,
  },
  system: {
    health: true,
    cpu: true,
    memory: true,
    disk: true,
    network: true,
    uptime: true,
  },
  backup: { database: true, restore: true, catalogSnapshot: true },
  subscriptions: { get: true, revoke: true, directConfigs: true },
  protocols: ['vmess', 'vless', 'trojan', 'shadowsocks', 'wireguard'],
};

/** eylanapi.json → normalized_capabilities_for_multi_panel */
export const EYLAN_NATIVE_CAPABILITIES: NativePanelCapabilities = {
  clients: {
    list: true,
    get: true,
    create: true,
    update: true,
    delete: true,
    toggle: true,
    resetTraffic: true,
    revokeSub: true,
    bulkCreate: true,
    bulkEnable: false,
    bulkDisable: false,
    bulkDelete: false,
    bulkResetTraffic: false,
  },
  clientFields: {
    maxClients: true,
    hwidLimit: false,
    note: false,
    protocols: true,
  },
  traffic: { perUser: true, aggregate: true },
  online: {
    userState: true,
    activeConnections: true,
    realtimeStream: false,
  },
  nodes: {
    list: true,
    health: true,
    traffic: true,
    realtimeResources: false,
    latency: false,
  },
  system: {
    health: true,
    cpu: false,
    memory: false,
    disk: false,
    network: false,
    uptime: false,
  },
  backup: { database: false, restore: false, catalogSnapshot: true },
  subscriptions: { get: true, revoke: true, directConfigs: true },
  protocols: ['openvpn', 'wireguard', 'l2tp', 'cisco'],
};

/** pasarguard521.json v5.2.1 */
export const PASARGUARD_NATIVE_CAPABILITIES: NativePanelCapabilities = {
  clients: {
    list: true,
    get: true,
    create: true,
    update: true,
    delete: true,
    toggle: true,
    resetTraffic: true,
    revokeSub: true,
    bulkCreate: false,
    bulkEnable: true,
    bulkDisable: true,
    bulkDelete: true,
    bulkResetTraffic: true,
  },
  clientFields: {
    maxClients: false,
    hwidLimit: true,
    note: true,
    protocols: false,
  },
  traffic: { perUser: true, aggregate: true },
  online: {
    userState: true,
    activeConnections: false,
    realtimeStream: false,
  },
  nodes: {
    list: true,
    health: true,
    traffic: true,
    realtimeResources: true,
    latency: true,
  },
  system: {
    health: true,
    cpu: true,
    memory: true,
    disk: true,
    network: true,
    uptime: true,
  },
  backup: { database: false, restore: false, catalogSnapshot: true },
  subscriptions: { get: true, revoke: true, directConfigs: true },
  protocols: ['vmess', 'vless', 'trojan', 'shadowsocks'],
};

export const NATIVE_CAPABILITIES_BY_TYPE: Record<
  PanelProviderType,
  NativePanelCapabilities
> = {
  '3x-ui': XUI_NATIVE_CAPABILITIES,
  eylan: EYLAN_NATIVE_CAPABILITIES,
  pasarguard: PASARGUARD_NATIVE_CAPABILITIES,
};

export function capabilitiesForPanelType(
  panelType: string | null | undefined,
): NativePanelCapabilities {
  if (panelType === 'eylan') return EYLAN_NATIVE_CAPABILITIES;
  if (panelType === 'pasarguard') return PASARGUARD_NATIVE_CAPABILITIES;
  return XUI_NATIVE_CAPABILITIES;
}

export function parseNativeCapabilities(
  raw: unknown,
  panelType?: string | null,
): NativePanelCapabilities {
  const fallback = capabilitiesForPanelType(panelType);
  if (!raw || typeof raw !== 'object') return fallback;
  const rec = raw as Record<string, unknown>;
  const mergeBool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const clients = (rec.clients || {}) as Record<string, unknown>;
  const fields = (rec.clientFields || {}) as Record<string, unknown>;
  const traffic = (rec.traffic || {}) as Record<string, unknown>;
  const online = (rec.online || {}) as Record<string, unknown>;
  const nodes = (rec.nodes || {}) as Record<string, unknown>;
  const system = (rec.system || {}) as Record<string, unknown>;
  const backup = (rec.backup || {}) as Record<string, unknown>;
  const subs = (rec.subscriptions || {}) as Record<string, unknown>;
  return {
    clients: {
      list: mergeBool(clients.list, fallback.clients.list),
      get: mergeBool(clients.get, fallback.clients.get),
      create: mergeBool(clients.create, fallback.clients.create),
      update: mergeBool(clients.update, fallback.clients.update),
      delete: mergeBool(clients.delete, fallback.clients.delete),
      toggle: mergeBool(clients.toggle, fallback.clients.toggle),
      resetTraffic: mergeBool(clients.resetTraffic, fallback.clients.resetTraffic),
      revokeSub: mergeBool(clients.revokeSub, fallback.clients.revokeSub),
      bulkCreate: mergeBool(clients.bulkCreate, fallback.clients.bulkCreate),
      bulkEnable: mergeBool(clients.bulkEnable, fallback.clients.bulkEnable),
      bulkDisable: mergeBool(clients.bulkDisable, fallback.clients.bulkDisable),
      bulkDelete: mergeBool(clients.bulkDelete, fallback.clients.bulkDelete),
      bulkResetTraffic: mergeBool(
        clients.bulkResetTraffic,
        fallback.clients.bulkResetTraffic,
      ),
    },
    clientFields: {
      maxClients: mergeBool(fields.maxClients, fallback.clientFields.maxClients),
      hwidLimit: mergeBool(fields.hwidLimit, fallback.clientFields.hwidLimit),
      note: mergeBool(fields.note, fallback.clientFields.note),
      protocols: mergeBool(fields.protocols, fallback.clientFields.protocols),
    },
    traffic: {
      perUser: mergeBool(traffic.perUser, fallback.traffic.perUser),
      aggregate: mergeBool(traffic.aggregate, fallback.traffic.aggregate),
    },
    online: {
      userState: mergeBool(online.userState, fallback.online.userState),
      activeConnections: mergeBool(
        online.activeConnections,
        fallback.online.activeConnections,
      ),
      realtimeStream: mergeBool(
        online.realtimeStream,
        fallback.online.realtimeStream,
      ),
    },
    nodes: {
      list: mergeBool(nodes.list, fallback.nodes.list),
      health: mergeBool(nodes.health, fallback.nodes.health),
      traffic: mergeBool(nodes.traffic, fallback.nodes.traffic),
      realtimeResources: mergeBool(
        nodes.realtimeResources,
        fallback.nodes.realtimeResources,
      ),
      latency: mergeBool(nodes.latency, fallback.nodes.latency),
    },
    system: {
      health: mergeBool(system.health, fallback.system.health),
      cpu: mergeBool(system.cpu, fallback.system.cpu),
      memory: mergeBool(system.memory, fallback.system.memory),
      disk: mergeBool(system.disk, fallback.system.disk),
      network: mergeBool(system.network, fallback.system.network),
      uptime: mergeBool(system.uptime, fallback.system.uptime),
    },
    backup: {
      database: mergeBool(backup.database, fallback.backup.database),
      restore: mergeBool(backup.restore, fallback.backup.restore),
      catalogSnapshot: mergeBool(
        backup.catalogSnapshot,
        fallback.backup.catalogSnapshot,
      ),
    },
    subscriptions: {
      get: mergeBool(subs.get, fallback.subscriptions.get),
      revoke: mergeBool(subs.revoke, fallback.subscriptions.revoke),
      directConfigs: mergeBool(
        subs.directConfigs,
        fallback.subscriptions.directConfigs,
      ),
    },
    protocols: Array.isArray(rec.protocols)
      ? rec.protocols.map((p) => String(p))
      : fallback.protocols,
  };
}

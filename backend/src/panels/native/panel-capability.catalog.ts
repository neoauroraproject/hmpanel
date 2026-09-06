import {
  capabilitiesForPanelType,
  type PanelProviderType,
} from './native-panel-capabilities';

/** Flat capability catalog used by UI/Policy. Mapped from NativePanelCapabilities. */
export const PANEL_CAPABILITY = {
  USERS: 'USERS',
  INBOUNDS: 'INBOUNDS',
  GROUPS: 'GROUPS',
  INSTANCES: 'INSTANCES',
  TRAFFIC: 'TRAFFIC',
  HWID: 'HWID',
  IP_LIMIT: 'IP_LIMIT',
  EXPIRATION: 'EXPIRATION',
  BACKUP: 'BACKUP',
  MONITORING: 'MONITORING',
  CLEANUP: 'CLEANUP',
} as const;

export type PanelCapabilityName =
  (typeof PANEL_CAPABILITY)[keyof typeof PANEL_CAPABILITY];

export type FlatCapabilityMap = Record<PanelCapabilityName, boolean>;

export function flatCapabilitiesFor(
  panelType: string | null | undefined,
): FlatCapabilityMap {
  const type = (panelType || '3x-ui') as PanelProviderType;
  const n = capabilitiesForPanelType(type);
  const isXui = type === '3x-ui';
  const isEylan = type === 'eylan';
  const isPg = type === 'pasarguard';
  return {
    USERS: n.clients.list && n.clients.create,
    INBOUNDS: isXui,
    GROUPS: isPg,
    INSTANCES: isEylan && n.nodes.list,
    TRAFFIC: n.traffic.perUser,
    HWID: n.clientFields.hwidLimit,
    IP_LIMIT: isXui || isPg,
    EXPIRATION: n.clients.update,
    BACKUP: n.backup.database,
    MONITORING: n.system.health,
    CLEANUP: isXui && n.clients.delete,
  };
}

export function hasCapability(
  panelType: string | null | undefined,
  cap: PanelCapabilityName,
): boolean {
  return !!flatCapabilitiesFor(panelType)[cap];
}

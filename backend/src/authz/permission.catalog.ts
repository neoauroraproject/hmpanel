export const PERMISSION_ACTIONS = [
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'panels.read',
  'panels.manage',
  'inbounds.assign',
  'groups.assign',
  'traffic.reset',
  'traffic.debit',
  'products.read',
  'products.manage',
  'orders.read',
  'orders.manage',
  'bots.read',
  'bots.manage',
  'themes.read',
  'themes.manage',
  'plugins.read',
  'plugins.manage',
  'settings.read',
  'settings.manage',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionScopeKind =
  | 'all'
  | 'own'
  | 'assigned'
  | 'panel'
  | 'inbound'
  | 'group'
  | 'store';

export interface PermissionScope {
  kind: PermissionScopeKind;
  id?: string;
}

export interface PermissionActor {
  id: string;
  role: string;
  /** Additive JSON from Admin.permissions (string[] or { actions?: string[] }). */
  permissions?: unknown;
  inboundIds?: string[];
  panelIds?: string[];
}

export const RESELLER_DEFAULTS: PermissionAction[] = [
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'traffic.reset',
  'inbounds.assign',
];

export function parsePermissionList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).actions)) {
    return (raw as any).actions.map((x: unknown) => String(x));
  }
  return [];
}

export function matchesAction(granted: string, action: string): boolean {
  if (granted === '*' || granted === action) return true;
  if (granted.endsWith('.*')) {
    const prefix = granted.slice(0, -2);
    return action === prefix || action.startsWith(`${prefix}.`);
  }
  return false;
}

export type ModuleKind = 'PLATFORM' | 'BUSINESS';

export type LicenseRequirement = 'premium' | 'business' | 'platform';

export interface ModulePermission {
  id: string;
  description: string;
  write?: boolean;
}

export interface ModuleMenuEntry {
  label: string;
  path: string;
  icon?: string;
}

export interface ModuleSchedulerJob {
  id: string;
  queue: string;
  cron?: string;
  requiresWrite?: boolean;
}

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  kind: ModuleKind;
  phase: number;
  defaultEnabled: boolean;
  licenseRequirement: LicenseRequirement;
  features: string[];
  dependencies: string[];
  permissions: ModulePermission[];
  routes: { backend: string; frontend: string };
  menus: ModuleMenuEntry[];
  scheduler: ModuleSchedulerJob[];
  requiredApiVersion?: string;
  readOnlyCapabilities: {
    read: string[];
    write: string[];
  };
  migrations?: string[];
}

export type LicenseMode = 'full' | 'read_only' | 'disabled';

export type LicenseStatus = 'active' | 'grace' | 'expired' | 'invalid' | 'community';

export interface LicenseState {
  status: LicenseStatus;
  mode: LicenseMode;
  expiresAt: string | null;
  graceEndsAt: string | null;
  licensedFeatures: string[];
  edition: 'COMMUNITY' | 'PREMIUM';
  lastHeartbeatAt?: string | null;
  lastServerCheckAt?: string | null;
  bundleVersion?: string | null;
  activationId?: string | null;
  instanceId?: string | null;
}

export interface ModuleAccess {
  moduleId: string;
  enabled: boolean;
  licensed: boolean;
  mode: LicenseMode;
  canRead: boolean;
  canWrite: boolean;
}

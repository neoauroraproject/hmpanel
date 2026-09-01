import type { NativePanelCapabilities, PanelProviderType } from './native-panel-capabilities';
import type { ConnectionHealth } from './panel-identity.util';

export interface PanelCredentialsInput {
  panelType: PanelProviderType;
  apiBaseUrl: string;
  apiKey?: string;
  apiToken?: string;
  username?: string;
  password?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  version?: string | null;
  remoteIdentity?: string | null;
  capabilities: NativePanelCapabilities;
  error?: string;
}

export interface RemoteClientSnapshot {
  username: string;
  remoteUserId?: string | null;
  uuid: string;
  enable: boolean;
  up: bigint;
  down: bigint;
  total: bigint;
  expiryTime: bigint;
  limitIp?: number;
  note?: string | null;
  online?: boolean;
  activeConnections?: number;
  subscriptionUrl?: string | null;
  resourceIds?: string[];
  providerMeta?: Record<string, unknown>;
}

export interface DriverCreateClientInput {
  username: string;
  totalBytes?: bigint;
  expiryTimeMs?: number;
  enable?: boolean;
  remark?: string;
  limitIp?: number;
  inboundIds?: string[];
  resourceIds?: string[];
  providerExtras?: Record<string, unknown>;
}

export interface DriverUpdateClientInput {
  totalBytes?: bigint;
  expiryTimeMs?: number;
  enable?: boolean;
  remark?: string;
  limitIp?: number;
  inboundIds?: string[];
  resourceIds?: string[];
  providerExtras?: Record<string, unknown>;
}

export interface SystemMetricsSample {
  cpu?: number;
  memory?: number;
  disk?: number;
  networkUp?: number;
  networkDown?: number;
  uptimeSeconds?: number;
  onlineUsers?: number;
  version?: string | null;
  latencyMs?: number;
}

export interface RemoteNodeSnapshot {
  id: string;
  name: string;
  status?: string;
  ip?: string;
  trafficBytes?: number;
  cpu?: number;
  latencyMs?: number;
}

export interface RemoteResourceSnapshot {
  id: string;
  name: string;
  kind: 'inbound' | 'group' | 'default';
}

export interface PanelSyncResult {
  success: boolean;
  syncedClients: number;
  syncedInbounds: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
  durationMs?: number;
}

export interface ParsedSubLink {
  username?: string;
  token?: string;
  provider?: PanelProviderType;
}

/**
 * Live CRUD / metrics against a remote panel.
 * Community 3x-ui create path is unchanged; this is used for Eylan/Pasarguard
 * and for capability-aware monitoring.
 */
export interface PanelDriver {
  readonly panelType: PanelProviderType;
  capabilities(): NativePanelCapabilities;
  testConnection(creds: PanelCredentialsInput): Promise<TestConnectionResult>;
  /** Saved panel — driver loads credentials from StoreAddonConnection. */
  testPanel?(panelId: string): Promise<TestConnectionResult>;
  resolveRemoteIdentity(creds: PanelCredentialsInput): Promise<string>;
  parseSubLink(link: string): ParsedSubLink | null;
  listClients(panelId: string): Promise<RemoteClientSnapshot[]>;
  getClient(panelId: string, username: string): Promise<RemoteClientSnapshot | null>;
  /** Live subscription URL (Eylan `/sub/{token}/{user}`, Pasarguard user sub). */
  getSubscriptionUrl?(panelId: string, username: string): Promise<string | null>;
  createClient(panelId: string, input: DriverCreateClientInput): Promise<RemoteClientSnapshot>;
  updateClient(
    panelId: string,
    username: string,
    input: DriverUpdateClientInput,
  ): Promise<RemoteClientSnapshot>;
  deleteClient(panelId: string, username: string): Promise<void>;
  setEnabled?(panelId: string, username: string, enabled: boolean): Promise<void>;
  resetTraffic?(panelId: string, username: string): Promise<void>;
  getOnlines?(panelId: string): Promise<string[]>;
  getSystemMetrics?(panelId: string): Promise<SystemMetricsSample | null>;
  listNodes?(panelId: string): Promise<RemoteNodeSnapshot[]>;
  listResources?(panelId: string): Promise<RemoteResourceSnapshot[]>;
}

export interface PanelSyncDriver {
  readonly panelType: PanelProviderType;
  sync(panelId: string): Promise<PanelSyncResult>;
}

export interface PanelOperationDecision {
  operable: boolean;
  reason: 'ok' | 'premium_unavailable' | 'module_disabled' | 'manually_disabled' | 'no_driver';
  connectionHealth: ConnectionHealth;
}

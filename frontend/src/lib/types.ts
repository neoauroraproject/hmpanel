export type Role = "SUPER_ADMIN" | "RESELLER";
export type TrafficMode = "ALLOCATION" | "USAGE";

export interface SessionAdmin {
  id: string;
  username: string;
  email: string;
  role: Role;
  portalSettings?: any;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  admin: SessionAdmin;
}

export interface Admin {
  id: string;
  username: string;
  email: string;
  role: Role;
  balance: number;
  trafficMode: TrafficMode;
  status: string;
  createdAt: string;
  _count?: { clients: number };
  totalAssigned?: number;
  usedTraffic?: number;
  remainingBalance?: number;
  storeEnabled?: boolean;
}

export interface Client {
  id: string;
  adminId: string;
  inboundId: string;
  email: string;
  remark: string | null;
  ownerTag: string | null;
  uuid: string;
  subId?: string | null;
  flow: string | null;
  enable: boolean;
  up: string;
  down: string;
  total: string;
  expiryTime: string;
  limitIp?: number;
  createdAt: string;
  updatedAt: string;

  admin?: { id: string; username: string };
  inbound?: {
    id: string;
    tag: string;
    port: number;
    protocol: string;
    streamSettings?: any;
    panel?: { id: string; name: string; url: string; subUrl?: string | null };
  };
  inbounds?: any[];
}

export interface Panel {
  id: string;
  name: string;
  url: string;
  subUrl?: string | null;
  authMode: string;
  status: string;
  createdAt: string;
  server: { id: string; name: string; ipAddress: string };
  syncState: {
    lastSync: string;
    wsConnected: boolean;
    latencyMs: number | null;
    status: string;
  } | null;
  _count: { inbounds: number };
}

export type TransactionType = "CREDIT" | "DEBIT" | "USAGE_CHARGE";

export interface Transaction {
  id: string;
  amount: string;
  type: TransactionType;
  action?: string | null;
  description: string | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  targetClientUuid?: string | null;
  createdAt: string;
  client: { id: string; email: string; uuid: string } | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Overview {
  panels: { total: number; online: number; offline: number };
  admins: { total: number; active: number; disabled?: number; suspended?: number };
  clients: { total: number; active: number; expired: number };
  traffic: { today: string; month: string; sold: string };
}

export interface SeriesPoint {
  label: string;
  bytes: number;
}

export interface NamedBytes {
  name: string;
  bytes: number;
}

export interface TrendsData {
  newClients?: { date: string; count: number }[];
  byAdmin: NamedBytes[];
  byInbound?: NamedBytes[];
  byPanel?: NamedBytes[];
  byTrafficMode?: NamedBytes[];
}

export interface Trends {
  allTime: TrendsData;
  last24h: TrendsData;
}

export interface Monitoring {
  servers: {
    server: string;
    cpu: number;
    ram: number;
    disk: number;
    netUp: string;
    netDown: string;
    recordedAt: string | null;
  }[];
  xray: { panel: string; status: string }[];
  lastSync: string | null;
  pendingJobs: number;
  failedJobs: number;
}

export interface PanelRow extends Panel {
  version: string | null;
  clientCount: number;
}

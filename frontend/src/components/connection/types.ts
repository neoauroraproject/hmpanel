export type OutputType = "subscription" | "wireguard" | "generic";

export type OutputMethod =
  | "subscription"
  | "native"
  | "qr"
  | "copy"
  | "nodes"
  | "preview"
  | "download"
  | "uri";

export type ProtocolCapabilities = {
  supportsSubscription: boolean;
  supportsQRCode: boolean;
  supportsConfigFile: boolean;
  supportsPreview: boolean;
  supportsURI: boolean;
  supportsDownload: boolean;
};

export type ClientOutputModel = {
  clientId: string;
  protocol: string;
  outputType: OutputType;
  capabilities: ProtocolCapabilities;
  methods: OutputMethod[];
  warnings: string[];
  payload: Record<string, unknown>;
  cacheKey?: string;
  builtAt?: string;
};

export type SubscriptionPayload = {
  systemSubUrl?: string;
  nativeSubUrl?: string | null;
  qrText?: string;
  nodes?: Array<{ link: string; protocol?: string; tag?: string }>;
};

export type WireGuardPayload = {
  configText?: string | null;
  qrText?: string | null;
  downloadFilename?: string;
  downloadPath?: string;
  adminDownloadPath?: string;
  details?: {
    endpoint?: string | null;
    address?: string;
    dns?: string;
    mtu?: number | null;
    allowedIPs?: string;
    persistentKeepalive?: number;
    publicKey?: string | null;
  };
};

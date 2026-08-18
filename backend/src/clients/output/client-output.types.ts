export type OutputType = 'subscription' | 'wireguard' | 'generic';

export type OutputMethod =
  | 'subscription'
  | 'native'
  | 'qr'
  | 'copy'
  | 'nodes'
  | 'preview'
  | 'download'
  | 'uri';

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
  /** Cache metadata */
  cacheKey?: string;
  builtAt?: string;
};

export const OUTPUT_BUILDER_VERSION = '2';

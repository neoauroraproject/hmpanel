import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PanelCapabilitiesService } from './panel-capabilities.service';
import { buildConnectionExtrasEnvelope } from '../clients/output/connection-extras';
import { ClientsService } from '../clients/clients.service';
import { AdminQuotaService } from '../traffic/admin-quota.service';
import {
  derivePanelConnectionFromUrl,
  panelEndpointFieldsFromUrl,
  resolvePanelApiBaseUrl,
} from '../common/utils/panel-url.util';
import axios, { AxiosError } from 'axios';
import * as https from 'https';
import * as crypto from 'crypto';
import { NativePanelOrchestrator } from './native/native-panel.orchestrator';
import { PanelOperationGate, withOperable } from './native/panel-operation-gate';
import { PanelDriverRegistry } from './native/panel-driver.registry';
import {
  XUI_NATIVE_CAPABILITIES,
  isExternalPanelType,
  parseNativeCapabilities,
} from './native/native-panel-capabilities';
import { generatePanelKey } from './native/panel-identity.util';

// ─── Provisioning Error Classification ───────────────────────────────────────
export type ProvisioningErrorCode =
  | 'DUPLICATE_EMAIL'
  | 'DUPLICATE_UUID'
  | 'TIMEOUT'
  | 'AUTH_FAILURE'
  | 'INBOUND_NOT_FOUND'
  | 'CLIENT_NOT_FOUND'
  | 'PANEL_ERROR'
  | 'NETWORK_ERROR'
  | 'VERIFICATION_FAILED'
  | 'UNKNOWN';

export interface PanelApiError {
  code: ProvisioningErrorCode;
  message: string; // Human-readable, safe to return to frontend
  httpStatus?: number;
  panelMessage?: string; // Raw panel error message
  endpoint: string;
  durationMs: number;
}

export interface PanelApiResult {
  success: boolean;
  data?: any;
  error?: PanelApiError;
}

export interface ProvisioningLogEvent {
  operation:
    | 'CREATE_CLIENT'
    | 'UPDATE_CLIENT'
    | 'DELETE_CLIENT'
    | 'RESET_TRAFFIC'
    | 'VERIFY_CLIENT'
    | 'SYNC_CLIENT';
  adminId?: string;
  panelId: string;
  panelName?: string;
  inboundDbId?: string;
  panelInboundId?: number;
  email: string;
  uuid?: string;
  endpoint: string;
  requestSizeBytes?: number;
  httpStatus?: number;
  durationMs: number;
  success: boolean;
  errorCode?: ProvisioningErrorCode;
  errorMessage?: string;
  verificationResult?: boolean;
}

// ─── HTTP Retry Configuration ─────────────────────────────────────────────────
const PANEL_CONNECT_TIMEOUT_MS = 10_000;
const PANEL_REQUEST_TIMEOUT_MS = 30_000;
const PANEL_RETRY_COUNT = 3;
const PANEL_RETRY_DELAYS_MS = [500, 1500, 4500] as const; // exponential backoff

@Injectable()
export class PanelsService implements OnModuleInit {
  private readonly logger = new Logger(PanelsService.name);
  private panelOnlineCache: Record<
    string,
    { emails: string[]; timestamp: number }
  > = {};
  private onlineIpsCache: { data: Record<string, number>; timestamp: number } =
    { data: {}, timestamp: 0 };

  constructor(
    private prisma: PrismaService,
    private panelCapabilitiesService: PanelCapabilitiesService,
    @Inject(forwardRef(() => ClientsService))
    private clientsService: ClientsService,
    private adminQuota: AdminQuotaService,
    private nativeOrchestrator: NativePanelOrchestrator,
    private panelGate: PanelOperationGate,
    private panelDrivers: PanelDriverRegistry,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Retry an axios call with exponential backoff. */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    label: string,
  ): Promise<T> {
    let lastErr: any;
    for (let attempt = 0; attempt <= PANEL_RETRY_COUNT; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const isTimeout =
          err.code === 'ECONNABORTED' ||
          err.code === 'ETIMEDOUT' ||
          err.message?.includes('timeout');
        const isNetErr =
          err.code === 'ECONNREFUSED' ||
          err.code === 'ENOTFOUND' ||
          err.code === 'ECONNRESET';
        // Only retry on transient network/timeout errors, not on 4xx responses
        if (!isTimeout && !isNetErr) throw err;
        if (attempt < PANEL_RETRY_COUNT) {
          const delay = PANEL_RETRY_DELAYS_MS[attempt] ?? 4500;
          this.logger.warn(
            `${label}: attempt ${attempt + 1} failed (${err.code || err.message}), retrying in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  /** Classify an axios error into a structured ProvisioningErrorCode. */
  private classifyError(
    err: any,
    endpoint: string,
    startTime: number,
  ): PanelApiError {
    const durationMs = Date.now() - startTime;
    const axiosErr = err as AxiosError;

    if (axiosErr.response) {
      const httpStatus = axiosErr.response.status;
      const body: any = axiosErr.response.data || {};
      const panelMsg: string = body?.msg || body?.message || '';
      const lower = panelMsg.toLowerCase();

      if (httpStatus === 401 || httpStatus === 403) {
        return {
          code: 'AUTH_FAILURE',
          message: 'Panel API authentication failed. Check API token.',
          httpStatus,
          panelMessage: panelMsg,
          endpoint,
          durationMs,
        };
      }
      if (
        lower.includes('email') &&
        (lower.includes('exist') ||
          lower.includes('duplicate') ||
          lower.includes('already'))
      ) {
        return {
          code: 'DUPLICATE_EMAIL',
          message: `Email already exists on the panel: ${panelMsg}`,
          httpStatus,
          panelMessage: panelMsg,
          endpoint,
          durationMs,
        };
      }
      if (
        lower.includes('uuid') &&
        (lower.includes('exist') || lower.includes('duplicate'))
      ) {
        return {
          code: 'DUPLICATE_UUID',
          message: `UUID collision on panel: ${panelMsg}`,
          httpStatus,
          panelMessage: panelMsg,
          endpoint,
          durationMs,
        };
      }
      if (
        lower.includes('inbound') &&
        (lower.includes('not found') || lower.includes('404'))
      ) {
        return {
          code: 'INBOUND_NOT_FOUND',
          message: `Inbound not found on panel: ${panelMsg}`,
          httpStatus,
          panelMessage: panelMsg,
          endpoint,
          durationMs,
        };
      }
      if (lower.includes('client') && lower.includes('not found')) {
        return {
          code: 'CLIENT_NOT_FOUND',
          message: `Client not found on panel: ${panelMsg}`,
          httpStatus,
          panelMessage: panelMsg,
          endpoint,
          durationMs,
        };
      }
      return {
        code: 'PANEL_ERROR',
        message: `Panel error (HTTP ${httpStatus}): ${panelMsg || 'No message'}`,
        httpStatus,
        panelMessage: panelMsg,
        endpoint,
        durationMs,
      };
    }

    if (
      err.code === 'ECONNABORTED' ||
      err.code === 'ETIMEDOUT' ||
      err.message?.includes('timeout')
    ) {
      return {
        code: 'TIMEOUT',
        message: `Panel did not respond within ${PANEL_REQUEST_TIMEOUT_MS / 1000}s. Operation cancelled.`,
        endpoint,
        durationMs,
      };
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return {
        code: 'NETWORK_ERROR',
        message: `Cannot reach panel: ${err.message}`,
        endpoint,
        durationMs,
      };
    }
    if (err instanceof BadRequestException) {
      const resp = err.getResponse() as any;
      const msg =
        typeof resp === 'string' ? resp : resp?.message || err.message;
      // Re-classify duplicate email thrown from our own addClient logic
      if (msg?.toLowerCase().includes('already exists')) {
        return { code: 'DUPLICATE_EMAIL', message: msg, endpoint, durationMs };
      }
      return { code: 'PANEL_ERROR', message: msg, endpoint, durationMs };
    }
    return {
      code: 'UNKNOWN',
      message: err.message || 'Unknown error',
      endpoint,
      durationMs,
    };
  }

  /** Emit a structured provisioning log event to Logger and AuditLog. */
  private async logProvisioningEvent(
    event: ProvisioningLogEvent,
  ): Promise<void> {
    const level = event.success ? 'log' : 'warn';
    this.logger[level](
      `[PROVISION:${event.operation}] panel=${event.panelId} email=${event.email} ` +
        `endpoint=${event.endpoint} status=${event.httpStatus ?? 'N/A'} ` +
        `duration=${event.durationMs}ms success=${event.success}` +
        (event.errorCode
          ? ` error=${event.errorCode}: ${event.errorMessage}`
          : '') +
        (event.verificationResult !== undefined
          ? ` verified=${event.verificationResult}`
          : ''),
    );
    try {
      await this.prisma.auditLog.create({
        data: {
          adminId: event.adminId || null,
          action: event.operation,
          entity: 'Client',
          entityId: event.inboundDbId || null,
          details: {
            panelId: event.panelId,
            panelName: event.panelName,
            panelInboundId: event.panelInboundId,
            email: event.email,
            uuid: event.uuid,
            endpoint: event.endpoint,
            requestSizeBytes: event.requestSizeBytes,
            httpStatus: event.httpStatus,
            durationMs: event.durationMs,
            success: event.success,
            errorCode: event.errorCode,
            errorMessage: event.errorMessage,
            verificationResult: event.verificationResult,
          },
        },
      });
    } catch {
      // Logging must never crash the provisioning flow
    }
  }

  /** Resolve the numeric panel inbound IDs needed for native client API calls.  */
  async resolveNumericInboundIds(
    inboundDbIds: string[],
  ): Promise<
    { id: string; panelId: string; panelInboundId: number; port: number }[]
  > {
    const uniqueIds = [...new Set(inboundDbIds.filter(Boolean))];
    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, panelId: true, panelInboundId: true, port: true },
    });
    if (inbounds.length !== uniqueIds.length) {
      const found = new Set(inbounds.map((i) => i.id));
      const missingIds = uniqueIds.filter((id) => !found.has(id));
      throw new BadRequestException(
        `Some selected inbounds no longer exist (${missingIds.length}). ` +
          `Sync the panel and re-select inbounds before updating the client.`,
      );
    }
    const missing = inbounds.filter((i) => i.panelInboundId === null);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Panel sync required before creating clients. The following inbounds have not been synced yet: ` +
          `${missing.map((i) => i.id).join(', ')}. Please trigger a panel sync and retry.`,
      );
    }
    return inbounds as {
      id: string;
      panelId: string;
      panelInboundId: number;
      port: number;
    }[];
  }

  /**
   * Normalize 3x-ui GET /clients/get/{email} body.
   * Older panels: { client, inboundIds }. Newer may return a flat client object.
   */
  private parseClientGetObj(obj: any): {
    client: Record<string, any> | null;
    inboundIds: number[];
  } {
    if (!obj || typeof obj !== 'object') {
      return { client: null, inboundIds: [] };
    }
    const nested = obj.client;
    const client =
      nested && typeof nested === 'object'
        ? nested
        : obj.email || obj.uuid || obj.id != null
          ? obj
          : null;
    const rawIds = Array.isArray(obj.inboundIds)
      ? obj.inboundIds
      : Array.isArray(nested?.inboundIds)
        ? nested.inboundIds
        : [];
    const inboundIds = rawIds
      .map((id: any) => Number(id))
      .filter((id: number) => Number.isFinite(id) && id > 0);
    return { client, inboundIds };
  }

  async onModuleInit() {
    this.logger.log('Starting auto-sync for all panels on boot...');
    this.syncAllPanelsInBackground();
  }

  private async syncAllPanelsInBackground() {
    try {
      const panels = await this.prisma.panel.findMany();
      for (const p of panels) {
        if (isExternalPanelType(p.panelType)) continue;
        this.sync(p.id).catch((e) =>
          this.logger.error(`Boot sync failed for panel ${p.name}:`, e.message),
        );
      }
      this.logger.log(`Triggered background sync for ${panels.length} panels.`);
    } catch (error: any) {
      this.logger.error(
        'Failed to trigger background sync on boot',
        error.message,
      );
    }
  }

  // discoverCapabilities removed in favor of PanelCapabilitiesService
  async testConnection(data: {
    url: string;
    apiToken?: string;
    panelId?: string;
  }) {
    if (data.panelId) {
      const saved = await this.prisma.panel.findUnique({
        where: { id: data.panelId },
      });
      if (saved && isExternalPanelType(saved.panelType)) {
        await this.panelGate.assertCanOperate(saved);
        const driver = this.panelDrivers.get(saved.panelType);
        if (!driver?.testPanel) {
          throw new BadRequestException(
            'Premium unavailable — this panel is frozen.',
          );
        }
        return driver.testPanel(saved.id);
      }
      if (saved && saved.apiToken && !data.apiToken) data.apiToken = saved.apiToken;
    }

    if (!data.url || !/^https?:\/\//.test(data.url)) {
      throw new BadRequestException('A valid http(s) URL is required');
    }
    const { normalizedUrl, webBasePath, apiBaseUrl } =
      derivePanelConnectionFromUrl(data.url);
    const urlObj = new URL(normalizedUrl);

    const parsedHost = urlObj.hostname;
    const parsedPort =
      urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');

    const startTime = Date.now();

    const checklist = {
      sslValid: true,
      apiReachable: false,
      authPassed: false,
      panelDetected: false,
      versionSupported: false,
    };

    const debugLog = {
      requestedUrl: normalizedUrl,
      method: 'GET',
      responseStatus: 0,
      endpoint: `${apiBaseUrl}/panel/api/server/status`,
    };

    let errorType: string | undefined;
    let exactError: string | undefined;
    let obj: any = {};
    let rawResponse: any = null;
    let pingMs = 0;

    try {
      const response = await axios.get(debugLog.endpoint, {
        headers: {
          Authorization: data.apiToken ? `Bearer ${data.apiToken}` : undefined,
        },
        timeout: 5000,
      });

      pingMs = Date.now() - startTime;
      checklist.apiReachable = true;
      debugLog.responseStatus = response.status;
      rawResponse = response.data;

      if (response.status === 200 && response.data && response.data.success) {
        checklist.authPassed = true;
        obj = response.data.obj || {};

        const panelVersion = obj.panelVersion || 'unknown';
        const xray = obj.xray || {};
        const xrayVersion = xray.version || 'unknown';

        if (obj && obj.panelVersion) {
          checklist.panelDetected = true;
        }

        if (panelVersion !== 'unknown') {
          checklist.versionSupported = true;
        }

        let inboundCount = 0;
        let clientCount = 0;
        try {
          const inboundsRes = await axios.get(
            `${apiBaseUrl}/panel/api/inbounds/list`,
            {
              headers: {
                Authorization: data.apiToken
                  ? `Bearer ${data.apiToken}`
                  : undefined,
              },
              timeout: 5000,
            },
          );
          if (inboundsRes.data && inboundsRes.data.success) {
            const apiInbounds = inboundsRes.data.obj || [];
            inboundCount = apiInbounds.length;
            for (const apiInbound of apiInbounds) {
              const settings =
                typeof apiInbound.settings === 'string'
                  ? JSON.parse(apiInbound.settings)
                  : apiInbound.settings;
              const clientsList = settings?.clients || [];
              clientCount += clientsList.length;
            }
          }
        } catch (inboundsErr: any) {
          // Soft failure on inbounds
        }

        const resolved =
          this.panelCapabilitiesService.resolveCapabilities(panelVersion);

        return {
          ok: true,
          checklist,
          version: panelVersion,
          xrayVersion: xrayVersion,
          capabilities: resolved.capabilities,
          apiVersion: panelVersion,
          pingMs,
          status: 'online',
          inboundCount,
          clientCount,
          parsedHost,
          parsedPort,
          webBasePath,
          apiBaseUrl,
          debugLog,
          rawResponse,
          message: 'Connection successful',
        };
      } else {
        // Response format is correct but success is false
        debugLog.responseStatus = response.status;
        rawResponse = response.data;
        if (obj && obj.panelVersion) {
          checklist.panelDetected = true;
        }
        const msgLower = response.data?.msg?.toLowerCase() || '';
        if (
          msgLower.includes('token') ||
          msgLower.includes('auth') ||
          msgLower.includes('login')
        ) {
          checklist.authPassed = false;
          errorType = 'Invalid Token';
        } else {
          errorType = 'API Version Unsupported';
        }
        exactError = response.data?.msg || 'Failed to authenticate with panel';
      }
    } catch (err: any) {
      pingMs = Date.now() - startTime;
      const axiosErr = err as AxiosError;

      if (axiosErr.response) {
        debugLog.responseStatus = axiosErr.response.status;
        checklist.apiReachable = true;
        checklist.panelDetected = true; // Got a HTTP response at least

        if (
          axiosErr.response.status === 401 ||
          axiosErr.response.status === 403
        ) {
          checklist.authPassed = false;
          errorType = 'Unauthorized';
          exactError = 'Invalid API Token or Credentials';
        } else if (axiosErr.response.status === 404) {
          checklist.panelDetected = false;
          errorType = 'API Version Unsupported';
          exactError =
            'This is not a 3x-ui panel (missing /panel/api/server/status). Edit the panel and set type to Eylan or Pasarguard.';
        } else {
          errorType = 'API Version Unsupported';
          exactError = `HTTP ${axiosErr.response.status}`;
        }
      } else if (axiosErr.request) {
        // Network error
        checklist.apiReachable = false;
        if (
          axiosErr.code === 'ECONNABORTED' ||
          err.message.includes('timeout')
        ) {
          errorType = 'Timeout';
          exactError = 'Connection timed out. Check firewall and routing.';
        } else if (
          axiosErr.code === 'CERT_HAS_EXPIRED' ||
          err.message.toLowerCase().includes('ssl') ||
          err.message.toLowerCase().includes('cert')
        ) {
          checklist.sslValid = false;
          errorType = 'SSL Error';
          exactError = 'Invalid or expired SSL Certificate.';
        } else if (axiosErr.code === 'ECONNREFUSED') {
          errorType = 'Panel Unreachable';
          exactError = 'Connection refused. Check URL and Port.';
        } else {
          errorType = 'Panel Unreachable';
          exactError = err.message;
        }
      } else {
        errorType = 'Unknown Error';
        exactError = err.message;
      }
    }

    // If we reached here, something failed
    return {
      ok: false,
      checklist,
      errorType,
      message: exactError,
      pingMs,
      parsedHost,
      parsedPort,
      webBasePath,
      apiBaseUrl,
      debugLog,
      rawResponse,
    };
  }

  async register(data: {
    serverId?: string;
    name: string;
    url: string;
    subUrl?: string;
    apiToken?: string;
    username?: string;
    password?: string;
  }) {
    const authMode = data.apiToken ? 'token' : 'credentials';
    if (authMode === 'credentials' && (!data.username || !data.password)) {
      throw new BadRequestException(
        'Username and password required for credential auth',
      );
    }

    let serverId = data.serverId;
    if (!serverId) {
      let server = await this.prisma.server.findFirst({ select: { id: true } });
      if (!server) {
        server = await this.prisma.server.create({
          data: {
            name: 'Local Server',
            ipAddress: '127.0.0.1',
          },
          select: { id: true },
        });
      }
      serverId = server.id;
    }

    const { normalizedUrl, webBasePath, apiBaseUrl } =
      panelEndpointFieldsFromUrl(data.url);

    let formattedSubUrl = null;
    if (data.subUrl && data.subUrl.trim() !== '') {
      formattedSubUrl = data.subUrl.trim();
      if (!formattedSubUrl.startsWith('https://')) {
        throw new BadRequestException(
          'Subscription URL must start with https://',
        );
      }
      if (!formattedSubUrl.endsWith('/')) {
        formattedSubUrl += '/';
      }
    } else {
      throw new BadRequestException('Subscription URL is required');
    }

    const testResult = await this.testConnection({
      url: normalizedUrl,
      apiToken: data.apiToken,
    });

    const panel = await this.prisma.panel.create({
      data: {
        serverId,
        name: data.name,
        url: normalizedUrl,
        subUrl: formattedSubUrl,
        version: 'unknown',
        apiToken: data.apiToken,
        username: data.username,
        password: data.password,
        authMode,
        status: 'online',
        panelType: '3x-ui',
        panelKey: generatePanelKey(),
        connectionHealth: 'CONNECTED',
        nativeCapabilities: XUI_NATIVE_CAPABILITIES as unknown as Prisma.InputJsonValue,
        webBasePath,
        apiBaseUrl,
        capabilities: (testResult.capabilities || {}) as Prisma.InputJsonValue,
        apiVersion:
          ('apiVersion' in testResult && (testResult as { apiVersion?: string }).apiVersion) ||
          testResult.version ||
          'unknown',
        lastCapabilityScan: new Date(),
      },
    });

    try {
      const syncReport = await this.sync(panel.id);

      await this.prisma.auditLog.create({
        data: {
          action: 'PANEL_REGISTERED',
          entity: 'Panel',
          entityId: panel.id,
          details: { url: panel.url },
        },
      });

      return {
        panelId: panel.id,
        name: panel.name,
        syncReport,
      };
    } catch (err: any) {
      return {
        panelId: panel.id,
        name: panel.name,
        syncReport: {
          success: false,
          error: err.message,
        },
      };
    }
  }

  async findAll() {
    const panels = await this.prisma.panel.findMany({
      select: {
        id: true,
        name: true,
        url: true,
        subUrl: true,
        version: true,
        authMode: true,
        status: true,
        createdAt: true,
        inboundCount: true,
        clientCount: true,
        lastSync: true,
        lastOnline: true,
        panelType: true,
        panelKey: true,
        connectionHealth: true,
        lastSyncError: true,
        lastHealthCheckAt: true,
        nativeCapabilities: true,
        server: { select: { id: true, name: true, ipAddress: true } },
        syncState: {
          select: {
            lastSync: true,
            wsConnected: true,
            latencyMs: true,
            status: true,
          },
        },
        _count: { select: { inbounds: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const decorated = [];
    for (const panel of panels) {
      const decision = await this.panelGate.decide(panel);
      decorated.push({
        ...withOperable(panel, decision),
        nativeCapabilities: parseNativeCapabilities(
          panel.nativeCapabilities,
          panel.panelType,
        ),
      });
    }
    return decorated;
  }

  async findOne(id: string) {
    const panel = await this.prisma.panel.findUnique({
      where: { id },
      include: {
        server: { select: { id: true, name: true, ipAddress: true } },
        inbounds: {
          select: {
            id: true,
            tag: true,
            port: true,
            protocol: true,
            _count: { select: { clientInbounds: true } },
          },
        },
        syncState: true,
      },
    });
    if (!panel) throw new NotFoundException('Panel not found');
    return panel;
  }

  async getInbounds(id: string) {
    await this.findOne(id); // Ensures panel exists
    const dbInbounds = await this.prisma.inbound.findMany({
      where: { panelId: id },
      select: {
        id: true,
        tag: true,
        remark: true,
        port: true,
        protocol: true,
        panelInboundId: true,
        nodeId: true,
        nodeName: true,
        originNodeGuid: true,
        panel: { select: { id: true, name: true } },
      },
      orderBy: [{ nodeId: 'asc' }, { tag: 'asc' }],
    });
    return dbInbounds;
  }

  async update(
    id: string,
    data: {
      name?: string;
      url?: string;
      subUrl?: string;
      apiToken?: string;
      status?: string;
    },
  ) {
    const existing = await this.findOne(id);
    if (isExternalPanelType(existing.panelType)) {
      await this.panelGate.assertCanOperate(existing);
      data = { name: data.name };
    }
    let formattedSubUrl: string | undefined | null = undefined;
    if (data.subUrl !== undefined) {
      if (data.subUrl && data.subUrl.trim() !== '') {
        formattedSubUrl = data.subUrl.trim();
        if (!formattedSubUrl.startsWith('https://')) {
          throw new BadRequestException(
            'Subscription URL must start with https://',
          );
        }
        if (!formattedSubUrl.endsWith('/')) {
          formattedSubUrl += '/';
        }
      } else {
        throw new BadRequestException('Subscription URL is required');
      }
    }

    const updateData: {
      name?: string;
      url?: string;
      webBasePath?: string;
      apiBaseUrl?: string;
      subUrl?: string;
      apiToken?: string;
      status?: string;
    } = {
      name: data.name,
      subUrl: formattedSubUrl,
      apiToken: data.apiToken,
      status: data.status,
    };

    if (data.url) {
      const endpoint = panelEndpointFieldsFromUrl(data.url);
      updateData.url = endpoint.normalizedUrl;
      updateData.webBasePath = endpoint.webBasePath;
      updateData.apiBaseUrl = endpoint.apiBaseUrl;
    }

    return this.prisma.panel.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        url: true,
        subUrl: true,
        version: true,
        authMode: true,
        status: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const inbounds = await this.prisma.inbound.findMany({
      where: { panelId: id },
      select: { id: true },
    });
    const inboundIds = inbounds.map((i) => i.id);

    const clients = await this.prisma.client.findMany({
      where: {
        inbounds: {
          some: {
            inboundId: { in: inboundIds },
          },
        },
      },
      include: {
        inbounds: true,
      },
    });

    const clientIdsToDelete = [];
    const clientInboundIdsToDelete = [];

    for (const c of clients) {
      const thisPanelInbounds = c.inbounds.filter((ci) =>
        inboundIds.includes(ci.inboundId),
      );
      const otherPanelInbounds = c.inbounds.filter(
        (ci) => !inboundIds.includes(ci.inboundId),
      );

      if (otherPanelInbounds.length === 0) {
        clientIdsToDelete.push(c.id);
      } else {
        for (const ci of thisPanelInbounds) {
          clientInboundIdsToDelete.push({
            clientId: c.id,
            inboundId: ci.inboundId,
          });
        }
      }
    }

    if (clientInboundIdsToDelete.length > 0) {
      for (const item of clientInboundIdsToDelete) {
        await this.prisma.clientInbound
          .delete({
            where: {
              clientId_inboundId: {
                clientId: item.clientId,
                inboundId: item.inboundId,
              },
            },
          })
          .catch(() => {});
      }
    }

    if (clientIdsToDelete.length > 0) {
      await this.prisma.trafficTransaction.deleteMany({
        where: { clientId: { in: clientIdsToDelete } },
      });
      await this.prisma.client.deleteMany({
        where: { id: { in: clientIdsToDelete } },
      });
    }

    await this.prisma.panel.delete({ where: { id } });
    return { deleted: true };
  }

  async scanCapabilities(id: string) {
    const panel = await this.findOne(id);
    return this.panelCapabilitiesService.scanAndPersist(
      id,
      panel.version || '3.2.5',
    );
  }

  async sync(id: string) {
    const panel = await this.findOne(id);
    if (isExternalPanelType(panel.panelType)) {
      return this.nativeOrchestrator.sync(id);
    }
    const startTime = Date.now();
    const apiBaseUrl = resolvePanelApiBaseUrl(panel);

    this.logger.debug(
      `[DIAGNOSTIC] Start Sync for panel ${id} (${panel.name}) at ${apiBaseUrl}`,
    );

    try {
      this.logger.debug(`[DIAGNOSTIC] GET /panel/api/server/status`);
      const statusRes = await axios.get(
        `${apiBaseUrl}/panel/api/server/status`,
        {
          headers: {
            Authorization: panel.apiToken
              ? `Bearer ${panel.apiToken}`
              : undefined,
          },
          timeout: 5000,
        },
      );

      this.logger.debug(
        `[DIAGNOSTIC] Response /server/status | HTTP ${statusRes.status} | success: ${statusRes.data?.success} | msg: ${statusRes.data?.msg} | obj type: ${typeof statusRes.data?.obj}`,
      );

      if (!statusRes.data || !statusRes.data.success) {
        throw new Error(statusRes.data?.msg || 'Failed to get server status');
      }

      const obj = statusRes.data.obj || {};
      const panelVersion = obj.panelVersion || '3.2.5';
      const xray = obj.xray || {};
      const version = panelVersion; // or combine them if needed
      const latencyMs = Date.now() - startTime;

      const cpuUsage = typeof obj.cpu === 'number' ? obj.cpu : 0;
      const memCurrent = obj.mem?.current ? Number(obj.mem.current) : 0;
      const memTotal = obj.mem?.total ? Number(obj.mem.total) : 1;
      const ramUsage = (memCurrent / memTotal) * 100;

      const diskCurrent = obj.disk?.current ? Number(obj.disk.current) : 0;
      const diskTotal = obj.disk?.total ? Number(obj.disk.total) : 1;
      const diskUsage = (diskCurrent / diskTotal) * 100;

      let caps =
        panel.capabilities && typeof panel.capabilities === 'object'
          ? (panel.capabilities as any)
          : null;
      const { hash: currentHash } =
        this.panelCapabilitiesService.resolveCapabilities(version);

      // Auto-Rescan: Trigger a capability scan if the panel version changed, or if the spec file changed (hash mismatch)
      if (
        panel.apiVersion !== version ||
        panel.capabilityHash !== currentHash ||
        !caps ||
        !caps.clientsApi
      ) {
        this.logger.log(
          `[SYNC] Version/Hash change detected or caps missing. Triggering capability rescan.`,
        );
        caps = await this.panelCapabilitiesService.scanAndPersist(id, version);
      } else {
        // Update version info without full rescan
        await this.prisma.panel.update({
          where: { id: panel.id },
          data: { version, apiVersion: version },
        });
      }

      // --- Group Sync & Conflict Detection ---
      try {
        const apiGroups = await this.listGroups(id);
        const apiGroupNames = new Set(
          apiGroups.map((g: any) => String(g.name)),
        );

        const resellers = await this.prisma.admin.findMany({
          where: { role: 'RESELLER' },
          select: { id: true, username: true },
        });

        const resellerNames = new Set(resellers.map((a) => a.username));

        for (const admin of resellers) {
          if (!apiGroupNames.has(admin.username)) {
            // Reseller has no matching group in panel — will be auto-created on next client add
            this.logger.debug(
              `Group for reseller ${admin.username} does not exist in panel ${id} yet.`,
            );
          }
        }

        for (const g of apiGroups) {
          const groupName = String(g.name);
          if (!resellerNames.has(groupName)) {
            // Group exists in panel but no matching reseller locally
            await this.prisma.auditLog.create({
              data: {
                action: 'GROUP_SYNC_INFO',
                entity: 'Panel',
                entityId: id,
                details: {
                  message: `Group "${groupName}" exists in panel but has no matching reseller locally.`,
                },
              },
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to sync groups for panel ${id}: ${err.message}`,
        );
      }
      // --- End Group Sync ---

      let apiInbounds = [];
      const unifiedClients: any[] = [];

      const headers = {
        Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined,
      };

      if (caps.clientsApi) {
        const inboundsUrl = caps.slimInbounds
          ? '/panel/api/inbounds/list/slim'
          : '/panel/api/inbounds/list';
        this.logger.debug(`[DIAGNOSTIC] GET ${inboundsUrl}`);
        const inboundsRes = await axios.get(`${apiBaseUrl}${inboundsUrl}`, {
          headers,
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        });
        this.logger.debug(
          `[DIAGNOSTIC] Response ${inboundsUrl} | HTTP ${inboundsRes.status} | success: ${inboundsRes.data?.success} | msg: ${inboundsRes.data?.msg} | obj length: ${Array.isArray(inboundsRes.data?.obj) ? inboundsRes.data.obj.length : typeof inboundsRes.data?.obj}`,
        );
        if (!inboundsRes.data || !inboundsRes.data.success)
          throw new Error(inboundsRes.data?.msg || 'Failed to fetch inbounds');
        apiInbounds = inboundsRes.data.obj || [];

        this.logger.debug(`[DIAGNOSTIC] GET /panel/api/clients/list`);
        const clientsRes = await axios.get(
          `${apiBaseUrl}/panel/api/clients/list`,
          { headers, timeout: PANEL_REQUEST_TIMEOUT_MS },
        );
        this.logger.debug(
          `[DIAGNOSTIC] Response /clients/list | HTTP ${clientsRes.status} | success: ${clientsRes.data?.success} | msg: ${clientsRes.data?.msg} | obj length: ${Array.isArray(clientsRes.data?.obj) ? clientsRes.data.obj.length : typeof clientsRes.data?.obj}`,
        );
        if (!clientsRes.data || !clientsRes.data.success)
          throw new Error(clientsRes.data?.msg || 'Failed to fetch clients');
        const apiClientsList = clientsRes.data.obj || [];

        this.logger.debug(
          `[DIAGNOSTIC] Parsing ${apiClientsList.length} clients from /clients/list`,
        );

        for (const c of apiClientsList) {
          const primaryInboundId = Array.isArray(c.inboundIds)
            ? c.inboundIds[0]
            : null;
          const primaryInbound = apiInbounds.find(
            (ib: any) => ib.id === primaryInboundId,
          );
          unifiedClients.push({
            uuid: c.uuid || c.id,
            subId: c.subId,
            email: c.email,
            group: c.group,
            flow: c.flow,
            enable: c.enable !== false,
            up: c.traffic?.up || 0,
            down: c.traffic?.down || 0,
            total: c.totalGB || 0,
            expiryTime: c.expiryTime || 0,
            inboundIds: c.inboundIds || [],
            // Protocol extras for connectionExtras envelope (WireGuard etc.)
            _raw: c,
            _protocol: primaryInbound?.protocol || null,
            _inboundMeta: primaryInbound
              ? {
                  protocol: primaryInbound.protocol,
                  port: primaryInbound.port,
                  listen: primaryInbound.listen,
                  shareAddr: primaryInbound.shareAddr,
                  shareAddrStrategy: primaryInbound.shareAddrStrategy,
                  nodeAddress: primaryInbound.nodeAddress,
                  wgDns: primaryInbound.wgDns,
                  wgMtu: primaryInbound.wgMtu,
                  wgPublicKey: primaryInbound.wgPublicKey,
                }
              : null,
          });
        }
      } else {
        this.logger.debug(
          `[DIAGNOSTIC] GET /panel/api/inbounds/list (Legacy parsing)`,
        );
        const inboundsRes = await axios.get(
          `${apiBaseUrl}/panel/api/inbounds/list`,
          { headers, timeout: PANEL_REQUEST_TIMEOUT_MS },
        );
        this.logger.debug(
          `[DIAGNOSTIC] Response /inbounds/list | HTTP ${inboundsRes.status} | success: ${inboundsRes.data?.success} | msg: ${inboundsRes.data?.msg} | obj length: ${Array.isArray(inboundsRes.data?.obj) ? inboundsRes.data.obj.length : typeof inboundsRes.data?.obj}`,
        );
        if (!inboundsRes.data || !inboundsRes.data.success)
          throw new Error(inboundsRes.data?.msg || 'Failed to fetch inbounds');
        apiInbounds = inboundsRes.data.obj || [];

        this.logger.debug(
          `[DIAGNOSTIC] Parsing legacy inbounds list with length: ${apiInbounds.length}`,
        );

        for (const apiInbound of apiInbounds) {
          const settings =
            typeof apiInbound.settings === 'string'
              ? JSON.parse(apiInbound.settings)
              : apiInbound.settings;
          const clientsList = settings?.clients || [];
          const clientStats = apiInbound.clientStats || [];
          const statsMap = new Map();
          for (const stat of clientStats) {
            if (stat.email) statsMap.set(stat.email.trim(), stat);
          }

          for (const c of clientsList) {
            const trimmedEmail =
              (c.email || '').trim() || `client-${(c.id || '').slice(0, 8)}`;
            const stats = statsMap.get(trimmedEmail) || {};
            unifiedClients.push({
              uuid: c.id,
              subId: c.subId || stats.subId,
              email: trimmedEmail,
              group: c.group,
              flow: c.flow,
              enable: stats.enable !== false,
              up: stats.up || 0,
              down: stats.down || 0,
              total: stats.total || 0,
              expiryTime: stats.expiryTime || 0,
              inboundIds: [apiInbound.id],
              _raw: c,
              _protocol: apiInbound.protocol || null,
              _inboundMeta: {
                protocol: apiInbound.protocol,
                port: apiInbound.port,
                listen: apiInbound.listen,
                shareAddr: apiInbound.shareAddr,
                shareAddrStrategy: apiInbound.shareAddrStrategy,
                nodeAddress: apiInbound.nodeAddress,
                wgDns: apiInbound.wgDns,
                wgMtu: apiInbound.wgMtu,
                wgPublicKey: apiInbound.wgPublicKey,
              },
            });
          }
        }
      }

      this.logger.debug(
        `[DIAGNOSTIC] Starting Database operations: ${apiInbounds.length} inbounds, ${unifiedClients.length} clients`,
      );

      // Node registry used to attribute inbounds to their physical host.
      // nodeId → name for the common case, guid → node for inbounds that report
      // no nodeId of their own (transitive sub-nodes are surfaced with id 0).
      const nodeNameById = new Map<number, string>();
      const nodeByGuid = new Map<string, { id: number; name: string }>();
      // Only true when the panel actually answered; a failed call must not be
      // read as "this panel has no nodes".
      let nodeRegistryKnown = false;
      try {
        const nodesRes = await axios.get(`${apiBaseUrl}/panel/api/nodes/list`, {
          headers,
          httpsAgent: this.getHttpsAgent(),
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        });
        if (nodesRes.data?.success && Array.isArray(nodesRes.data.obj)) {
          nodeRegistryKnown = true;
          for (const n of nodesRes.data.obj) {
            const nid = Number(n?.id);
            const id = Number.isFinite(nid) && nid > 0 ? nid : 0;
            const label = String(
              n?.name || n?.remark || (id ? `Node ${id}` : ''),
            ).trim();
            if (id && label) nodeNameById.set(id, label);
            const guid = String(n?.guid || '').trim();
            if (guid) nodeByGuid.set(guid, { id, name: label });
          }
          this.logger.debug(
            `[DIAGNOSTIC] Loaded ${nodeNameById.size} node name(s) / ${nodeByGuid.size} node guid(s) for inbound attribution`,
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to fetch nodes list for panel ${panel.name}: ${err.message}`,
        );
      }
      // A panel with no registered nodes cannot host node inbounds, whatever the
      // list API reports per inbound.
      const panelHasNodes =
        !nodeRegistryKnown || nodeByGuid.size > 0 || nodeNameById.size > 0;

      let totalSyncedInbounds = 0;
      let totalSyncedClients = 0;
      let panelUpDelta = 0n;
      let panelDownDelta = 0n;

      const apiEmails = new Set<string>();
      const syncReport = {
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        repaired: 0,
      };

      const admins = await this.prisma.admin.findMany({
        select: { id: true, username: true },
      });
      const adminMap = new Map<string, string>();
      for (const admin of admins) {
        adminMap.set(admin.username.toLowerCase(), admin.id);
      }

      const apiInboundIdToDbId = new Map<number, string>();
      const syncedLocalInboundIds = new Set<string>();

      // 1. Sync Inbounds — ALWAYS prefer remote panelInboundId.
      // Same port on master + node is valid (distinct remote ids). Port fallback
      // only reclaims legacy local rows that still have null panelInboundId.
      // When a node/inbound disappears from the Sanaei API list, stale prune below
      // deletes the local row (matches panel API truth).
      this.logger.debug(
        `[DIAGNOSTIC] Syncing ${apiInbounds.length} inbounds into Database`,
      );
      for (const apiInbound of apiInbounds) {
        totalSyncedInbounds++;
        const settings =
          typeof apiInbound.settings === 'string'
            ? JSON.parse(apiInbound.settings || '{}')
            : apiInbound.settings || {};
        const streamSettings =
          typeof apiInbound.streamSettings === 'string'
            ? JSON.parse(apiInbound.streamSettings || '{}')
            : apiInbound.streamSettings || {};

        const remoteId =
          apiInbound.id !== undefined && apiInbound.id !== null
            ? Number(apiInbound.id)
            : null;

        const nodeIdRaw =
          apiInbound.nodeId !== undefined && apiInbound.nodeId !== null
            ? Number(apiInbound.nodeId)
            : null;
        // Local master xray ⇒ null/0. Remote node ⇒ nodeId > 0 (same rule 3x-ui's
        // own inbound list uses). originNodeGuid is never proof of remote hosting
        // on its own: newer 3x-ui stamps local inbounds with the master's own
        // panelGuid at API read time, so it only counts when it matches the guid
        // of a node this panel actually has registered.
        const originNodeGuid =
          String(apiInbound.originNodeGuid || '').trim() || null;
        const guidNode = originNodeGuid
          ? nodeByGuid.get(originNodeGuid) || null
          : null;
        let nodeId =
          nodeIdRaw != null && !Number.isNaN(nodeIdRaw) && nodeIdRaw > 0
            ? nodeIdRaw
            : null;
        // Transitive sub-nodes are projected with id 0, so their inbounds carry no
        // usable nodeId — the origin guid is the only handle on the real host.
        if (!nodeId && guidNode && guidNode.id > 0) nodeId = guidNode.id;
        let nodeName =
          (nodeId ? nodeNameById.get(nodeId) : null) || guidNode?.name || null;
        if (!panelHasNodes) {
          nodeId = null;
          nodeName = null;
        }

        let dbInbound =
          remoteId != null && !Number.isNaN(remoteId)
            ? await this.prisma.inbound.findFirst({
                where: { panelId: panel.id, panelInboundId: remoteId },
              })
            : null;

        // Legacy reclaim: only a row with NO remote id yet may bind by port.
        if (!dbInbound) {
          const byPortLegacy = await this.prisma.inbound.findFirst({
            where: {
              panelId: panel.id,
              port: apiInbound.port,
              panelInboundId: null,
            },
          });
          if (byPortLegacy) {
            dbInbound = byPortLegacy;
          }
        } else if (remoteId != null && !Number.isNaN(remoteId)) {
          // Absorb pure legacy ghosts on this port into the ID-matched row.
          const ghosts = await this.prisma.inbound.findMany({
            where: {
              panelId: panel.id,
              port: apiInbound.port,
              panelInboundId: null,
              id: { not: dbInbound.id },
            },
            select: { id: true },
          });
          for (const ghost of ghosts) {
            await this.mergeInboundInto(ghost.id, dbInbound.id);
          }
        }

        // Keep the last known node label when the inbound is still node-hosted but
        // /nodes/list was unreachable this round, so the badge does not degrade to
        // a nameless one on a transient failure.
        const isNodeHosted = panelHasNodes && Boolean(nodeId || guidNode);
        const persistedNodeName =
          nodeName ?? (isNodeHosted ? (dbInbound?.nodeName ?? null) : null);

        const inboundData = {
          panelInboundId: remoteId,
          tag: apiInbound.remark || `inbound-${apiInbound.port}`,
          remark: apiInbound.remark || null,
          port: apiInbound.port,
          protocol: apiInbound.protocol,
          settings,
          streamSettings,
          nodeId,
          nodeName: persistedNodeName,
          originNodeGuid,
        };

        if (!dbInbound) {
          dbInbound = await this.prisma.inbound.create({
            data: {
              panelId: panel.id,
              ...inboundData,
            },
          });
        } else {
          dbInbound = await this.prisma.inbound.update({
            where: { id: dbInbound.id },
            data: {
              panelInboundId: remoteId ?? dbInbound.panelInboundId,
              tag: inboundData.tag || dbInbound.tag,
              remark: inboundData.remark ?? dbInbound.remark,
              port: apiInbound.port,
              protocol: apiInbound.protocol,
              settings,
              streamSettings,
              nodeId,
              nodeName: persistedNodeName,
              originNodeGuid,
            },
          });
        }
        if (remoteId != null && !Number.isNaN(remoteId)) {
          apiInboundIdToDbId.set(remoteId, dbInbound.id);
        }
        syncedLocalInboundIds.add(dbInbound.id);
      }

      // Drop local inbounds no longer present on the remote panel
      // (ClientInbound / AdminInbound cascade on delete).
      const staleInbounds = await this.prisma.inbound.findMany({
        where: {
          panelId: panel.id,
          id: { notIn: [...syncedLocalInboundIds] },
        },
        select: { id: true, port: true, tag: true, panelInboundId: true },
      });
      if (staleInbounds.length) {
        const staleIds = staleInbounds.map((i) => i.id);
        const staleIdSet = new Set(staleIds);
        await this.prisma.inbound.deleteMany({
          where: { id: { in: staleIds } },
        });
        this.logger.log(
          `[SYNC] Panel ${panel.name}: pruned ${staleInbounds.length} stale inbound(s): ${staleInbounds
            .map((i) => `${i.tag}:${i.port}`)
            .join(', ')}`,
        );

        // Scrub JSON inbound refs on store provisioning profiles for this panel
        try {
          const profiles = await this.prisma.provisioningProfile.findMany({
            where: { panelId: panel.id },
            select: { id: true, inboundIds: true },
          });
          for (const profile of profiles) {
            const ids = Array.isArray(profile.inboundIds)
              ? (profile.inboundIds as string[])
              : [];
            const next = ids.filter((id) => !staleIdSet.has(id));
            if (next.length !== ids.length) {
              await this.prisma.provisioningProfile.update({
                where: { id: profile.id },
                data: { inboundIds: next },
              });
            }
          }
        } catch (scrubErr: any) {
          this.logger.warn(
            `[SYNC] Could not scrub store profile inbound refs: ${scrubErr?.message || scrubErr}`,
          );
        }
      }

      // 2. Sync Clients
      const adminUsageCharges = new Map<string, bigint>();

      this.logger.debug(
        `[DIAGNOSTIC] Syncing ${unifiedClients.length} clients into Database`,
      );

      const processedEmails = new Set<string>();

      for (const unifiedClient of unifiedClients) {
        totalSyncedClients++;
        if (!unifiedClient.uuid && !unifiedClient.email) continue; // safety check

        const trimmedEmail = (
          unifiedClient.email ||
          `client-${String(unifiedClient.uuid || '').slice(0, 8)}`
        ).trim();

        if (processedEmails.has(trimmedEmail)) {
          this.logger.warn(
            `[SYNC] Panel ${panel.name} returned duplicate client email: ${trimmedEmail}. Skipping.`,
          );
          syncReport.skipped++;
          continue;
        }
        processedEmails.add(trimmedEmail);
        apiEmails.add(trimmedEmail);

        try {
          const dbClient = await this.prisma.client.findUnique({
            where: {
              panelId_email: { panelId: panel.id, email: trimmedEmail },
            },
            include: { admin: true, inbounds: true },
          });

          const up = BigInt(unifiedClient.up || 0);
          const down = BigInt(unifiedClient.down || 0);
          const total = BigInt(unifiedClient.total || 0);
          const expiryTime = BigInt(unifiedClient.expiryTime || 0);
          const enable = unifiedClient.enable;

          let resolvedAdminId = dbClient?.adminId || null;
          if (unifiedClient.group) {
            resolvedAdminId =
              adminMap.get(unifiedClient.group.toLowerCase()) || null;
          }

          const remoteInboundIds = (unifiedClient.inboundIds || [])
            .map((id: any) => Number(id))
            .filter((id: number) => Number.isFinite(id) && id > 0);
          const localInboundIds = remoteInboundIds
            .map((id: number) => apiInboundIdToDbId.get(id))
            .filter(Boolean) as string[];
          const unmappedRemoteInboundIds = remoteInboundIds.filter(
            (id: number) => !apiInboundIdToDbId.has(id),
          );

          const connectionExtras = buildConnectionExtrasEnvelope({
            protocol: unifiedClient._protocol,
            client: unifiedClient._raw || unifiedClient,
            inbound: unifiedClient._inboundMeta,
          }) as unknown as Prisma.InputJsonValue;

          // If client doesn't exist locally at all:
          if (!dbClient) {
            this.logger.log(
              `[SYNC_DECISION] email="${trimmedEmail}" panelId="${panel.id}" existingDBRecord=NONE decision=CREATE`,
            );
            await this.prisma.client.create({
              data: {
                panelId: panel.id,
                uuid: unifiedClient.uuid || crypto.randomUUID(), // Ensure UUID is always generated
                subId: unifiedClient.subId || null,
                subToken: crypto.randomBytes(5).toString('hex'),
                email: trimmedEmail,
                adminId: resolvedAdminId,
                enable,
                up,
                down,
                total,
                expiryTime,
                flow: unifiedClient.flow || null,
                connectionExtras,
                inbounds: {
                  create: localInboundIds.map((id: string) => ({
                    inboundId: id,
                  })),
                },
              },
            });
            syncReport.created++;
          } else {
            syncReport.updated++;
            // Usage Accounting Delta Calculation
            const usedOldUp = dbClient.up;
            const usedOldDown = dbClient.down;
            const upDelta = up > usedOldUp ? up - usedOldUp : 0n;
            const downDelta = down > usedOldDown ? down - usedOldDown : 0n;

            panelUpDelta += upDelta;
            panelDownDelta += downDelta;

            const delta = upDelta + downDelta;

            if (
              delta > 0n &&
              dbClient.admin &&
              dbClient.admin.trafficMode === 'USAGE' &&
              dbClient.adminId
            ) {
              const chargeKey = `${dbClient.adminId}:${panel.id}`;
              const currentCharge =
                adminUsageCharges.get(chargeKey) || 0n;
              adminUsageCharges.set(chargeKey, currentCharge + delta);
            }

            // Conflict Detection (Ignore up/down normal usage)
            const changes = [];
            if (dbClient.enable !== enable)
              changes.push(`enable: ${dbClient.enable} -> ${enable}`);
            if (dbClient.total !== total)
              changes.push(`total: ${dbClient.total} -> ${total}`);
            if (dbClient.expiryTime !== expiryTime)
              changes.push(
                `expiryTime: ${dbClient.expiryTime} -> ${expiryTime}`,
              );

            if (changes.length > 0) {
              await this.prisma.auditLog.create({
                data: {
                  action: 'SYNC_CONFLICT_RESOLVED',
                  entity: 'Client',
                  entityId: dbClient.id,
                  details: {
                    message: 'Panel state overwrote DB state',
                    changes,
                  },
                },
              });
            }

            const changedData: any = {};
            if (dbClient.uuid !== unifiedClient.uuid && unifiedClient.uuid) {
              changedData.uuid = unifiedClient.uuid;
              syncReport.repaired++;
            }
            if (dbClient.email !== trimmedEmail)
              changedData.email = trimmedEmail;
            if (unifiedClient.subId && dbClient.subId !== unifiedClient.subId)
              changedData.subId = unifiedClient.subId;
            if (dbClient.adminId !== resolvedAdminId)
              changedData.adminId = resolvedAdminId;
            if (dbClient.enable !== enable) {
              changedData.enable = enable;
              if (!enable) {
                const usedNew = up + down;
                if (total > 0n && usedNew >= total)
                  changedData.disableReason = 'TRAFFIC_LIMIT';
                else if (expiryTime > 0n && BigInt(Date.now()) >= expiryTime)
                  changedData.disableReason = 'EXPIRED';
                else changedData.disableReason = 'MANUAL';
              } else {
                changedData.disableReason = null;
              }
            }
            if (dbClient.up !== up) changedData.up = up;
            if (dbClient.down !== down) changedData.down = down;
            if (dbClient.total !== total) {
              if (total < dbClient.total) {
                this.logger.warn(
                  `[SYNC] Preserving DB total for ${trimmedEmail}: ` +
                    `panel=${total} db=${dbClient.total}`,
                );
                await this.prisma.auditLog.create({
                  data: {
                    action: 'SYNC_TOTAL_CONFLICT',
                    entity: 'Client',
                    entityId: dbClient.id,
                    details: {
                      message:
                        'Panel total lower than DB — preserving paid allocation',
                      panelTotal: total.toString(),
                      dbTotal: dbClient.total.toString(),
                    },
                  },
                });
              } else {
                changedData.total = total;
              }
            }
            if (dbClient.expiryTime !== expiryTime)
              changedData.expiryTime = expiryTime;
            if (dbClient.flow !== unifiedClient.flow)
              changedData.flow = unifiedClient.flow;
            // Always refresh protocol extras on sync (keys/endpoint may change)
            changedData.connectionExtras = connectionExtras;

            if (Object.keys(changedData).length > 0) {
              await this.prisma.client.update({
                where: { id: dbClient.id },
                data: changedData,
              });
            }

            // Sync ClientInbound relations
            // If the panel reports inbound IDs we cannot map yet, do NOT wipe
            // existing local links (common right after inbound prune/resync).
            const existingInbounds = dbClient.inbounds.map((i) => i.inboundId);
            if (
              localInboundIds.length === 0 &&
              remoteInboundIds.length > 0 &&
              unmappedRemoteInboundIds.length > 0
            ) {
              this.logger.warn(
                `[SYNC] Preserving ClientInbound links for ${trimmedEmail}: ` +
                  `remote inboundIds=[${remoteInboundIds.join(',')}] could not be mapped locally`,
              );
            } else {
              const toAdd = localInboundIds.filter(
                (id: string) => !existingInbounds.includes(id),
              );
              const toRemove = existingInbounds.filter(
                (id) => !localInboundIds.includes(id),
              );

              if (toRemove.length > 0) {
                await this.prisma.clientInbound.deleteMany({
                  where: { clientId: dbClient.id, inboundId: { in: toRemove } },
                });
              }
              if (toAdd.length > 0) {
                await this.prisma.clientInbound.createMany({
                  data: toAdd.map((id: string) => ({
                    clientId: dbClient.id,
                    inboundId: id,
                  })),
                });
              }
            }
          }
        } catch (clientErr: any) {
          syncReport.failed++;
          this.logger.error(
            `[SYNC] Failed to sync client ${trimmedEmail} on panel ${panel.id}: ${clientErr.message}`,
          );
        }
      }

      this.logger.log(
        `[SYNC] Panel ${panel.name} Sync Report: Created=${syncReport.created}, Updated=${syncReport.updated}, Repaired=${syncReport.repaired}, Skipped=${syncReport.skipped}, Failed=${syncReport.failed}`,
      );

      // Apply Usage Charges for USAGE mode admins
      for (const [chargeKey, totalDelta] of adminUsageCharges.entries()) {
        if (totalDelta < 1048576n) continue;
        const [adminId, panelId] = chargeKey.split(':');
        if (!adminId || !panelId) continue;
        await this.adminQuota.applyUsageCharge(adminId, panelId, totalDelta);
      }

      // Orphan Cleanup
      const dbClientsInPanel = await this.prisma.client.findMany({
        where: { panelId: panel.id },
        include: { admin: true },
      });

      for (const dbC of dbClientsInPanel) {
        if (!apiEmails.has(dbC.email)) {
          try {
            await this.clientsService.deleteOrphanFromSync(dbC);
          } catch (orphanErr: any) {
            this.logger.error(
              `[SYNC] Orphan delete failed for ${dbC.email}: ${orphanErr.message}`,
            );
          }
        }
      }

      this.logger.debug(`[DIAGNOSTIC] Committing panel stats to DB`);
      // Record global traffic deltas for this panel's clients
      await this.prisma.systemStats.create({
        data: {
          serverId: panel.serverId,
          cpuUsage,
          ramUsage,
          diskUsage,
          netUp: panelUpDelta,
          netDown: panelDownDelta,
        },
      });

      await this.prisma.panel.update({
        where: { id },
        data: {
          status: 'online',
          version,
          lastOnline: new Date(),
          lastSync: new Date(),
          inboundCount: syncedLocalInboundIds.size,
          clientCount: apiEmails.size,
          syncState: {
            upsert: {
              create: {
                lastSync: new Date(),
                status: 'success',
                latencyMs: latencyMs,
              },
              update: {
                lastSync: new Date(),
                status: 'success',
                latencyMs: latencyMs,
              },
            },
          },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'SYNC_COMPLETED',
          entity: 'Panel',
          entityId: id,
          details: {
            message: 'Panel synchronization completed successfully',
            inboundCount: syncedLocalInboundIds.size,
            clientCount: apiEmails.size,
          },
        },
      });

      const dbClientCount = await this.prisma.client.count({
        where: {
          inbounds: {
            some: {
              inbound: {
                panelId: id,
              },
            },
          },
        },
      });
      const discrepancies = dbClientCount - totalSyncedClients;
      const discrepancyMsg =
        discrepancies === 0
          ? 'Perfect Match'
          : `Found ${Math.abs(discrepancies)} ${discrepancies > 0 ? 'extra DB clients' : 'missing DB clients'}`;

      this.logger.log(
        `Sync complete for Panel ${id}. API: ${totalSyncedClients}, DB: ${dbClientCount}. ${discrepancyMsg}`,
      );

      const syncDurationMs = Date.now() - startTime;

      await this.prisma.auditLog.create({
        data: {
          action: 'PANEL_SYNC_SUCCESS',
          entity: 'Panel',
          entityId: id,
          details: {
            syncedInbounds: syncedLocalInboundIds.size,
            syncedClients: totalSyncedClients,
            latencyMs,
          },
        },
      });

      this.logger.debug(`[DIAGNOSTIC] Sync Finished successfully`);

      return {
        success: true,
        version,
        syncedInbounds: syncedLocalInboundIds.size,
        syncedClients: totalSyncedClients,
        dbClientCount,
        discrepancyMsg,
        syncDurationMs,
      };
    } catch (err: any) {
      this.logger.error(
        `[DIAGNOSTIC] Sync failed with exception: ${err.message}`,
        err.stack,
      );

      await this.prisma.panel.update({
        where: { id },
        data: { status: 'offline' },
      });

      await this.prisma.syncState.upsert({
        where: { panelId: id },
        create: {
          panelId: id,
          lastSync: new Date(),
          lastPolledAt: new Date(),
          wsConnected: false,
          status: 'failure',
          errorLogs: err.message,
        },
        update: {
          lastPolledAt: new Date(),
          wsConnected: false,
          status: 'failure',
          errorLogs: err.message,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'PANEL_SYNC_FAILURE',
          entity: 'Panel',
          entityId: id,
          details: { error: err.message },
        },
      });

      throw new BadRequestException(`Sync failed: ${err.message}`);
    }
  }

  async restartXray(id: string) {
    const panel = await this.findOne(id);
    if (isExternalPanelType(panel.panelType)) {
      throw new BadRequestException('Xray restart is not supported on this panel');
    }
    const apiBaseUrl = resolvePanelApiBaseUrl(panel);
    try {
      const response = await axios.post(
        `${apiBaseUrl}/panel/api/server/restartXrayService`,
        {},
        {
          headers: {
            Authorization: panel.apiToken
              ? `Bearer ${panel.apiToken}`
              : undefined,
          },
          timeout: 5000,
        },
      );
      if (response.data && response.data.success) {
        return { ok: true, message: 'Xray restart issued successfully' };
      } else {
        throw new Error(response.data?.msg || 'Restart failed');
      }
    } catch (err: any) {
      throw new BadRequestException(`Xray restart failed: ${err.message}`);
    }
  }

  async logs(id: string) {
    const panel = await this.findOne(id);
    const logs = await this.prisma.auditLog.findMany({
      where: { entityId: id, entity: 'Panel' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Format them for the frontend UI which expects a string array
    const lines = logs.map(
      (l) =>
        `[${l.createdAt.toISOString()}] [${l.action}] ${l.details ? JSON.stringify(l.details) : ''}`,
    );

    return {
      panel: panel.name,
      lines: lines.length > 0 ? lines : ['No internal logs available yet.'],
    };
  }

  private getHttpsAgent() {
    return new https.Agent({ rejectUnauthorized: false });
  }

  private updateQueues = new Map<string, Promise<any>>();

  async updateInboundFull(
    panelId: string,
    inboundPort: number,
    modifier: (inbound: any) => void,
  ) {
    const lockKey = `${panelId}:${inboundPort}`;
    const prev = this.updateQueues.get(lockKey) || Promise.resolve();

    const next = (async () => {
      try {
        await prev;
      } catch (e) {} // Wait for previous task regardless of its outcome
      return await this._doUpdateInboundFull(panelId, inboundPort, modifier);
    })();

    this.updateQueues.set(lockKey, next);

    next.finally(() => {
      if (this.updateQueues.get(lockKey) === next) {
        this.updateQueues.delete(lockKey);
      }
    });

    return next;
  }

  /** Move client/admin links from a ghost inbound onto the kept row, then delete the ghost. */
  private async mergeInboundInto(fromId: string, toId: string) {
    if (fromId === toId) return;

    const fromClientLinks = await this.prisma.clientInbound.findMany({
      where: { inboundId: fromId },
    });
    for (const link of fromClientLinks) {
      const exists = await this.prisma.clientInbound.findUnique({
        where: {
          clientId_inboundId: { clientId: link.clientId, inboundId: toId },
        },
      });
      if (!exists) {
        await this.prisma.clientInbound.create({
          data: { clientId: link.clientId, inboundId: toId },
        });
      }
    }

    const fromAdminLinks = await this.prisma.adminInbound.findMany({
      where: { inboundId: fromId },
    });
    for (const link of fromAdminLinks) {
      const exists = await this.prisma.adminInbound.findUnique({
        where: {
          adminId_inboundId: { adminId: link.adminId, inboundId: toId },
        },
      });
      if (!exists) {
        await this.prisma.adminInbound.create({
          data: { adminId: link.adminId, inboundId: toId },
        });
      }
    }

    await this.prisma.inbound.delete({ where: { id: fromId } });
    this.logger.log(
      `[SYNC] Merged ghost inbound ${fromId} into ${toId} (${fromClientLinks.length} client link(s), ${fromAdminLinks.length} admin link(s))`,
    );
  }

  private async _doUpdateInboundFull(
    panelId: string,
    inboundPort: number,
    modifier: (inbound: any) => void,
  ) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = resolvePanelApiBaseUrl(panel);
    const headers = {
      Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined,
    };
    const httpsAgent = this.getHttpsAgent();

    const listRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/list`, {
      headers,
      httpsAgent,
      timeout: 5000,
    });
    if (!listRes.data || !listRes.data.success)
      throw new Error('Failed to list inbounds');
    const inboundList = listRes.data.obj || [];
    const inboundMeta = inboundList.find((i: any) => i.port === inboundPort);
    if (!inboundMeta)
      throw new Error(`Inbound with port ${inboundPort} not found on panel`);

    const getRes = await axios.get(
      `${apiBaseUrl}/panel/api/inbounds/get/${inboundMeta.id}`,
      { headers, httpsAgent, timeout: 5000 },
    );
    if (!getRes.data || !getRes.data.success)
      throw new Error('Failed to fetch full inbound data');
    const inbound = getRes.data.obj;

    modifier(inbound);

    if (typeof inbound.settings === 'object') {
      inbound.settings = JSON.stringify(inbound.settings);
    }
    if (typeof inbound.streamSettings === 'object') {
      inbound.streamSettings = JSON.stringify(inbound.streamSettings);
    }

    const updateRes = await axios.post(
      `${apiBaseUrl}/panel/api/inbounds/update/${inbound.id}`,
      inbound,
      { headers, httpsAgent, timeout: 5000 },
    );
    if (!updateRes.data || !updateRes.data.success)
      throw new Error(updateRes.data?.msg || 'Failed to update inbound');

    return updateRes.data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NATIVE CLIENT API LAYER
  // All methods below use /panel/api/clients/* endpoints exclusively.
  // updateInboundFull() is NOT called from any of these methods.
  //
  // ROOT CAUSE OF "Native updateClient failed 404" (now fixed):
  //   OLD: POST /panel/api/inbounds/updateClient/{UUID}   ← wrong path + wrong param
  //   NEW: POST /panel/api/clients/update/{email}         ← correct path + email param
  //
  // LIVE PROBE RESULTS (2026-06-24, ServerB1 v3.3.1):
  //   All /clients/* endpoints confirmed working.
  //   /clients/traffic/{email} returns success:true + obj:null for missing clients
  //   → use /clients/get/{email} success:false as delete sentinel instead.
  //   /clients/del/{email} returns success:false for non-existent (not idempotent)
  //   → treat CLIENT_NOT_FOUND as successful rollback.
  // ═══════════════════════════════════════════════════════════════════════════

  private async getPanelHttpContext(panelId: string) {
    const panel = await this.findOne(panelId);
    const base = resolvePanelApiBaseUrl(panel);
    const headers = {
      Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined,
    };
    const agent = this.getHttpsAgent();
    return { panel, base, headers, agent };
  }

  /**
   * Normalize a merged client object for POST /panel/api/clients/update/{email}.
   * Per docs/api342.json: GET returns ClientRecord (allowedIPs: string) but
   * update binds to Client (allowedIPs: string[]). Merging without conversion
   * causes Go json unmarshal errors on 3.4.2+ panels.
   */
  private normalizeClientUpdateBody(
    body: Record<string, any>,
  ): Record<string, any> {
    const normalized = { ...body };

    if (Object.prototype.hasOwnProperty.call(normalized, 'allowedIPs')) {
      const raw = normalized.allowedIPs;
      if (Array.isArray(raw)) {
        normalized.allowedIPs = raw.map((ip) => String(ip));
      } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
          normalized.allowedIPs = [];
        } else if (trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            normalized.allowedIPs = Array.isArray(parsed)
              ? parsed.map((ip) => String(ip))
              : [trimmed];
          } catch {
            normalized.allowedIPs = [trimmed];
          }
        } else if (trimmed.includes(',')) {
          normalized.allowedIPs = trimmed
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          normalized.allowedIPs = [trimmed];
        }
      } else if (raw == null) {
        delete normalized.allowedIPs;
      } else {
        normalized.allowedIPs = [];
      }
    }

    // ClientRecord-only fields (api342) — not part of Client update schema
    delete normalized.uuid;
    delete normalized.createdAt;
    delete normalized.updatedAt;

    return normalized;
  }

  /**
   * CREATE CLIENT on panel using native POST /panel/api/clients/add
   * Logs: method, full URL, payload, response, panel base URL, identifier used
   */
  async createClientOnPanel(
    panelId: string,
    numericInboundIds: number[],
    clientPayload: {
      email: string;
      totalGB?: number;
      expiryTime?: number;
      limitIp?: number;
      limitHwid?: number;
      tgId?: number;
      enable?: boolean;
      flow?: string;
      subId?: string;
      comment?: string;
      reset?: number;
      resetMax?: number;
      trafficReset?: string;
      trafficResetDay?: number;
    },
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/add`;
    const body = { client: clientPayload, inboundIds: numericInboundIds };
    const startMs = Date.now();

    this.logger.log(
      `[CREATE_CLIENT] PANEL_BASE=${base} METHOD=POST URL=${endpoint} ` +
        `IDENTIFIER=email:"${clientPayload.email}" ` +
        `INBOUND_IDS=${JSON.stringify(numericInboundIds)} ` +
        `PAYLOAD_SIZE=${JSON.stringify(body).length}B`,
    );

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(endpoint, body, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: PANEL_REQUEST_TIMEOUT_MS,
          }),
        `CREATE_CLIENT email=${clientPayload.email}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(
        `[CREATE_CLIENT] RESPONSE HTTP=${res.status} success=${ok} ` +
          `msg="${res.data?.msg || ''}" duration=${durationMs}ms`,
      );

      await this.logProvisioningEvent({
        operation: 'CREATE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email: clientPayload.email,
        endpoint,
        requestSizeBytes: JSON.stringify(body).length,
        httpStatus: res.status,
        durationMs,
        success: ok,
        errorCode: ok ? undefined : 'PANEL_ERROR',
        errorMessage: ok ? undefined : res.data?.msg,
      });

      if (!ok) {
        const panelMsg: string = res.data?.msg || '';
        const lower = panelMsg.toLowerCase();
        let code: ProvisioningErrorCode = 'PANEL_ERROR';
        if (
          lower.includes('email') &&
          (lower.includes('exist') ||
            lower.includes('duplicate') ||
            lower.includes('already') ||
            lower.includes('required'))
        )
          code = 'DUPLICATE_EMAIL';
        else if (lower.includes('uuid') && lower.includes('exist'))
          code = 'DUPLICATE_UUID';
        else if (
          lower.includes('record not found') ||
          lower.includes('inbound')
        )
          code = 'INBOUND_NOT_FOUND';
        return {
          success: false,
          error: {
            code,
            message: panelMsg,
            httpStatus: res.status,
            panelMessage: panelMsg,
            endpoint,
            durationMs,
          },
        };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(
        `[CREATE_CLIENT] FAILED email=${clientPayload.email} error=${apiError.code}: ${apiError.message}`,
      );
      await this.logProvisioningEvent({
        operation: 'CREATE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email: clientPayload.email,
        endpoint,
        requestSizeBytes: JSON.stringify(body).length,
        durationMs: apiError.durationMs,
        success: false,
        errorCode: apiError.code,
        errorMessage: apiError.message,
      });
      return { success: false, error: apiError };
    }
  }

  /**
   * BULK CREATE via POST /panel/api/clients/bulkCreate
   * Body: JSON array of { client, inboundIds } — same shape as /clients/add.
   * Per docs/api342.json and api331.json.
   */
  async bulkCreateClientsOnPanel(
    panelId: string,
    items: Array<{ client: Record<string, any>; inboundIds: number[] }>,
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/bulkCreate`;
    const startMs = Date.now();

    this.logger.log(
      `[BULK_CREATE] PANEL_BASE=${base} METHOD=POST URL=${endpoint} COUNT=${items.length}`,
    );

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(endpoint, items, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: Math.max(
              PANEL_REQUEST_TIMEOUT_MS,
              PANEL_REQUEST_TIMEOUT_MS * Math.ceil(items.length / 25),
            ),
          }),
        `BULK_CREATE count=${items.length}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      await this.logProvisioningEvent({
        operation: 'CREATE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email: `bulk:${items.length}`,
        endpoint,
        requestSizeBytes: JSON.stringify(items).length,
        httpStatus: res.status,
        durationMs,
        success: ok,
        errorCode: ok ? undefined : 'PANEL_ERROR',
        errorMessage: ok ? undefined : res.data?.msg,
      });

      if (!ok) {
        return {
          success: false,
          error: {
            code: 'PANEL_ERROR',
            message: res.data?.msg || 'Bulk create failed',
            httpStatus: res.status,
            panelMessage: res.data?.msg,
            endpoint,
            durationMs,
          },
        };
      }

      return { success: true, data: res.data?.obj ?? res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      return { success: false, error: apiError };
    }
  }

  /**
   * BULK ADJUST via POST /panel/api/clients/bulkAdjust
   * Shifts expiry and/or traffic quota for many clients in one call.
   */
  async bulkAdjustClientsOnPanel(
    panelId: string,
    body: {
      emails: string[];
      addDays?: number;
      addBytes?: number;
      flow?: string;
    },
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/bulkAdjust`;
    const startMs = Date.now();

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(endpoint, body, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: PANEL_REQUEST_TIMEOUT_MS,
          }),
        `BULK_ADJUST emails=${body.emails.length}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      if (!ok) {
        return {
          success: false,
          error: {
            code: 'PANEL_ERROR',
            message: res.data?.msg || 'Bulk adjust failed',
            httpStatus: res.status,
            endpoint,
            durationMs,
          },
        };
      }

      return { success: true, data: res.data?.obj ?? res.data };
    } catch (err: any) {
      return { success: false, error: this.classifyError(err, endpoint, startMs) };
    }
  }

  /**
   * BULK DELETE via POST /panel/api/clients/bulkDel
   * Body: { emails: string[], keepTraffic?: boolean } — per docs/api350.json.
   * The panel processes the list sequentially and reports per-email failures in
   * `obj.skipped`, so a successful response can still contain skipped emails.
   */
  async bulkDeleteClientsOnPanel(
    panelId: string,
    emails: string[],
    opts?: { keepTraffic?: boolean },
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/bulkDel`;
    const startMs = Date.now();

    this.logger.log(
      `[BULK_DELETE] PANEL_BASE=${base} METHOD=POST URL=${endpoint} COUNT=${emails.length}`,
    );

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(
            endpoint,
            { emails, keepTraffic: opts?.keepTraffic === true },
            {
              headers: { ...headers, 'Content-Type': 'application/json' },
              httpsAgent: agent,
              timeout: Math.max(
                PANEL_REQUEST_TIMEOUT_MS,
                PANEL_REQUEST_TIMEOUT_MS * Math.ceil(emails.length / 25),
              ),
            },
          ),
        `BULK_DELETE emails=${emails.length}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;
      const obj = res.data?.obj ?? {};

      this.logger.log(
        `[BULK_DELETE] RESPONSE HTTP=${res.status} success=${res.data?.success} ` +
          `deleted=${obj?.deleted ?? 0} skipped=${obj?.skipped?.length ?? 0} duration=${durationMs}ms`,
      );

      await this.logProvisioningEvent({
        operation: 'DELETE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email: `bulk:${emails.length}`,
        endpoint,
        requestSizeBytes: JSON.stringify(emails).length,
        httpStatus: res.status,
        durationMs,
        success: ok,
        errorCode: ok ? undefined : 'PANEL_ERROR',
        errorMessage: ok ? undefined : res.data?.msg,
      });

      if (!ok) {
        return {
          success: false,
          error: {
            code: 'PANEL_ERROR',
            message: res.data?.msg || 'Bulk delete failed',
            httpStatus: res.status,
            panelMessage: res.data?.msg,
            endpoint,
            durationMs,
          },
        };
      }

      return { success: true, data: obj };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(
        `[BULK_DELETE] FAILED count=${emails.length} error=${apiError.code}: ${apiError.message}`,
      );
      await this.logProvisioningEvent({
        operation: 'DELETE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email: `bulk:${emails.length}`,
        endpoint,
        durationMs: apiError.durationMs,
        success: false,
        errorCode: apiError.code,
        errorMessage: apiError.message,
      });
      return { success: false, error: apiError };
    }
  }

  /**
   * BULK RESET TRAFFIC via POST /panel/api/clients/bulkResetTraffic
   */
  async bulkResetTrafficOnPanel(
    panelId: string,
    emails: string[],
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/bulkResetTraffic`;
    const startMs = Date.now();

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(endpoint, { emails }, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: PANEL_REQUEST_TIMEOUT_MS,
          }),
        `BULK_RESET_TRAFFIC emails=${emails.length}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      if (!ok) {
        return {
          success: false,
          error: {
            code: 'PANEL_ERROR',
            message: res.data?.msg || 'Bulk reset traffic failed',
            httpStatus: res.status,
            endpoint,
            durationMs,
          },
        };
      }

      return { success: true, data: res.data?.obj ?? res.data };
    } catch (err: any) {
      return { success: false, error: this.classifyError(err, endpoint, startMs) };
    }
  }

  /**
   * UPDATE CLIENT on panel using native POST /panel/api/clients/update/{email}
   * Identifier: EMAIL (not UUID)
   * Content-Type: application/json (not form-encoded)
   */
  async updateClientOnPanel(
    panelId: string,
    email: string,
    clientPayload: Record<string, any>,
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);

    // 1. Fetch existing full client to avoid overwriting password/security/etc with empty values
    const getEndpoint = `${base}/panel/api/clients/get/${encodeURIComponent(email)}`;
    const startMs = Date.now();
    let existingClientObj: any = {};
    try {
      const getRes = await this.retryRequest(
        () =>
          axios.get(getEndpoint, {
            headers,
            httpsAgent: agent,
            timeout: PANEL_REQUEST_TIMEOUT_MS,
          }),
        `GET_CLIENT email=${email}`,
      );
      if (getRes.data?.success && getRes.data?.obj != null) {
        const parsed = this.parseClientGetObj(getRes.data.obj);
        if (parsed.client) {
          existingClientObj = parsed.client;
        } else {
          return {
            success: false,
            error: {
              code: 'CLIENT_NOT_FOUND',
              message: getRes.data?.msg || 'Client not found',
              httpStatus: getRes.status,
              endpoint: getEndpoint,
              durationMs: 0,
            },
          };
        }
      } else {
        return {
          success: false,
          error: {
            code: 'CLIENT_NOT_FOUND',
            message: getRes.data?.msg || 'Client not found',
            httpStatus: getRes.status,
            endpoint: getEndpoint,
            durationMs: 0,
          },
        };
      }
    } catch (err: any) {
      const apiError = this.classifyError(err, getEndpoint, startMs);
      return { success: false, error: apiError };
    }

    const endpoint = `${base}/panel/api/clients/update/${encodeURIComponent(email)}`;
    // Build the update body: merge existing client fields with new payload.
    // Ensure we do NOT send inboundIds to this endpoint as per 3.3.1 API.
    const body = this.normalizeClientUpdateBody({
      ...existingClientObj,
      ...clientPayload,
      email,
    });
    delete body.inboundIds;

    this.logger.log(
      `[UPDATE_CLIENT] PANEL_BASE=${base} METHOD=POST URL=${endpoint} ` +
        `IDENTIFIER=email:"${email}" ` +
        `PAYLOAD_SIZE=${JSON.stringify(body).length}B`,
    );

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(endpoint, body, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: PANEL_REQUEST_TIMEOUT_MS,
          }),
        `UPDATE_CLIENT email=${email}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(
        `[UPDATE_CLIENT] RESPONSE HTTP=${res.status} success=${ok} ` +
          `msg="${res.data?.msg || ''}" duration=${durationMs}ms`,
      );

      await this.logProvisioningEvent({
        operation: 'UPDATE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email,
        endpoint,
        requestSizeBytes: JSON.stringify(body).length,
        httpStatus: res.status,
        durationMs,
        success: ok,
        errorCode: ok ? undefined : 'PANEL_ERROR',
        errorMessage: ok ? undefined : res.data?.msg,
      });

      if (!ok) {
        const panelMsg: string = res.data?.msg || '';
        const lower = panelMsg.toLowerCase();
        const isNotFound =
          lower.includes('record not found') || lower.includes('not found');

        // CLIENT_NOT_FOUND on UPDATE is a real error — the client was unexpectedly missing.
        // Do NOT treat it as success. Only deleteClientOnPanel() treats not-found as idempotent.
        const code: ProvisioningErrorCode = isNotFound
          ? 'CLIENT_NOT_FOUND'
          : 'PANEL_ERROR';
        this.logger.warn(
          `[UPDATE_CLIENT] Client ${email} update failed: ${panelMsg} (code=${code})`,
        );
        return {
          success: false,
          error: {
            code,
            message: panelMsg,
            httpStatus: res.status,
            panelMessage: panelMsg,
            endpoint,
            durationMs,
          },
        };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(
        `[UPDATE_CLIENT] FAILED email=${email} error=${apiError.code}: ${apiError.message}`,
      );
      await this.logProvisioningEvent({
        operation: 'UPDATE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email,
        endpoint,
        durationMs: apiError.durationMs,
        success: false,
        errorCode: apiError.code,
        errorMessage: apiError.message,
      });
      return { success: false, error: apiError };
    }
  }

  async attachInboundsToClient(
    panelId: string,
    email: string,
    inboundIds: number[],
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/${encodeURIComponent(email)}/attach`;
    const body = { inboundIds };
    const startMs = Date.now();

    this.logger.log(
      `[ATTACH_INBOUNDS] PANEL_BASE=${base} METHOD=POST URL=${endpoint} IDENTIFIER=email:"${email}" INBOUND_IDS=[${inboundIds.join(',')}]`,
    );

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(endpoint, body, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: PANEL_REQUEST_TIMEOUT_MS,
          }),
        `ATTACH_INBOUNDS email=${email}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(
        `[ATTACH_INBOUNDS] RESPONSE HTTP=${res.status} success=${ok} msg="${res.data?.msg || ''}" duration=${durationMs}ms`,
      );

      if (!ok) {
        return {
          success: false,
          error: {
            code: 'PANEL_ERROR',
            message: res.data?.msg || '',
            httpStatus: res.status,
            panelMessage: res.data?.msg,
            endpoint,
            durationMs,
          },
        };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(
        `[ATTACH_INBOUNDS] FAILED email=${email} error=${apiError.code}: ${apiError.message}`,
      );
      return { success: false, error: apiError };
    }
  }

  async detachInboundsFromClient(
    panelId: string,
    email: string,
    inboundIds: number[],
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/${encodeURIComponent(email)}/detach`;
    const body = { inboundIds };
    const startMs = Date.now();

    this.logger.log(
      `[DETACH_INBOUNDS] PANEL_BASE=${base} METHOD=POST URL=${endpoint} IDENTIFIER=email:"${email}" INBOUND_IDS=[${inboundIds.join(',')}]`,
    );

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(endpoint, body, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: PANEL_REQUEST_TIMEOUT_MS,
          }),
        `DETACH_INBOUNDS email=${email}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(
        `[DETACH_INBOUNDS] RESPONSE HTTP=${res.status} success=${ok} msg="${res.data?.msg || ''}" duration=${durationMs}ms`,
      );

      if (!ok) {
        return {
          success: false,
          error: {
            code: 'PANEL_ERROR',
            message: res.data?.msg || '',
            httpStatus: res.status,
            panelMessage: res.data?.msg,
            endpoint,
            durationMs,
          },
        };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(
        `[DETACH_INBOUNDS] FAILED email=${email} error=${apiError.code}: ${apiError.message}`,
      );
      return { success: false, error: apiError };
    }
  }

  /**
   * DELETE CLIENT on panel using native POST /panel/api/clients/del/{email}
   * Identifier: EMAIL (not UUID)
   * NOT idempotent: returns success:false if client not found.
   * Treat CLIENT_NOT_FOUND as a successful rollback (client was never there).
   */
  async deleteClientOnPanel(
    panelId: string,
    email: string,
    adminId?: string,
    isRollback = false,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/del/${encodeURIComponent(email)}`;
    const startMs = Date.now();

    this.logger.log(
      `[DELETE_CLIENT] PANEL_BASE=${base} METHOD=POST URL=${endpoint} ` +
        `IDENTIFIER=email:"${email}" isRollback=${isRollback}`,
    );

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(
            endpoint,
            {},
            {
              headers: { ...headers, 'Content-Type': 'application/json' },
              httpsAgent: agent,
              timeout: PANEL_REQUEST_TIMEOUT_MS,
            },
          ),
        `DELETE_CLIENT email=${email}`,
      );

      const durationMs = Date.now() - startMs;
      const panelMsg: string = res.data?.msg || '';
      const lower = panelMsg.toLowerCase();
      const notFound = lower.includes('not found');
      const ok = res.data?.success === true || notFound;

      this.logger.log(
        `[DELETE_CLIENT] RESPONSE HTTP=${res.status} success=${res.data?.success} ` +
          `msg="${panelMsg}" notFound=${notFound} effectiveOk=${ok} duration=${durationMs}ms`,
      );

      await this.logProvisioningEvent({
        operation: 'DELETE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email,
        endpoint,
        httpStatus: res.status,
        durationMs,
        success: ok,
        errorCode:
          !ok && notFound
            ? 'CLIENT_NOT_FOUND'
            : !ok
              ? 'PANEL_ERROR'
              : undefined,
        errorMessage: ok ? undefined : panelMsg,
      });

      if (!ok) {
        const code: ProvisioningErrorCode = notFound
          ? 'CLIENT_NOT_FOUND'
          : 'PANEL_ERROR';
        return {
          success: false,
          error: {
            code,
            message: panelMsg,
            httpStatus: res.status,
            panelMessage: panelMsg,
            endpoint,
            durationMs,
          },
        };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(
        `[DELETE_CLIENT] FAILED email=${email} error=${apiError.code}: ${apiError.message}`,
      );
      await this.logProvisioningEvent({
        operation: 'DELETE_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email,
        endpoint,
        durationMs: apiError.durationMs,
        success: false,
        errorCode: apiError.code,
        errorMessage: apiError.message,
      });
      return { success: false, error: apiError };
    }
  }

  /**
   * Protocol share URLs for a client via authenticated panel API.
   * Preferred when the public /sub/ host is unreachable from HMPanel
   * (common CDN/geo split) — same strings as 3x-ui "Copy URL".
   */
  async getClientProtocolLinks(
    panelId: string,
    opts: { email?: string; subId?: string | null },
  ): Promise<string[]> {
    const email = String(opts.email || '').trim();
    const subId = String(opts.subId || '').trim();
    if (!email && !subId) return [];

    const { base, headers, agent } = await this.getPanelHttpContext(panelId);
    const endpoints: string[] = [];
    if (email) {
      endpoints.push(
        `${base}/panel/api/clients/links/${encodeURIComponent(email)}`,
      );
    }
    if (subId) {
      endpoints.push(
        `${base}/panel/api/clients/subLinks/${encodeURIComponent(subId)}`,
      );
    }

    const extractLinks = (obj: any): string[] => {
      const rows = Array.isArray(obj)
        ? obj
        : Array.isArray(obj?.links)
          ? obj.links
          : Array.isArray(obj?.urls)
            ? obj.urls
            : [];
      return rows
        .map((l: any) => String(l || '').trim())
        .filter((l: string) => /^[a-z0-9+.-]+:\/\//i.test(l));
    };

    for (const endpoint of endpoints) {
      try {
        const res = await axios.get(endpoint, {
          headers,
          httpsAgent: agent,
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        });
        if (res.data?.success) {
          const links = extractLinks(res.data.obj);
          if (links.length > 0) {
            this.logger.log(
              `[CLIENT_LINKS] ${endpoint} → ${links.length} URI(s)`,
            );
            return links;
          }
          this.logger.warn(
            `[CLIENT_LINKS] ${endpoint} success but empty obj`,
          );
        } else {
          this.logger.warn(
            `[CLIENT_LINKS] ${endpoint} success=${res.data?.success} msg=${res.data?.msg || ''}`,
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `[CLIENT_LINKS] ${endpoint} failed: ${err.message}`,
        );
      }
    }
    return [];
  }

  /**
   * Host endpoints from 3x-ui (Hosts page). Remarks here are the names
   * that should appear on subscription configs — not the client email.
   */
  async getPanelHostEndpoints(panelId: string): Promise<
    Array<{
      address?: string | null;
      hosts?: unknown;
      port?: number | null;
      remark?: string | null;
      inboundId?: number | null;
      isDisabled?: boolean;
    }>
  > {
    try {
      const { base, headers, agent } = await this.getPanelHttpContext(panelId);
      const endpoints = [
        `${base}/panel/api/hosts/list`,
        `${base}/panel/api/inbounds/hosts`,
      ];
      for (const endpoint of endpoints) {
        try {
          const res = await axios.get(endpoint, {
            headers,
            httpsAgent: agent,
            timeout: PANEL_REQUEST_TIMEOUT_MS,
          });
          if (!res.data?.success) continue;
          const rows = Array.isArray(res.data.obj)
            ? res.data.obj
            : Array.isArray(res.data.obj?.hosts)
              ? res.data.obj.hosts
              : Array.isArray(res.data.obj?.list)
                ? res.data.obj.list
                : [];
          if (rows.length) {
            this.logger.log(
              `[HOSTS] ${endpoint} → ${rows.length} host row(s)`,
            );
            return this.flattenHostEndpointRows(rows);
          }
        } catch (err: any) {
          this.logger.debug(
            `[HOSTS] ${endpoint} failed: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`[HOSTS] panel=${panelId} ${err.message}`);
    }
    return [];
  }

  private flattenHostEndpointRows(rows: any[]): any[] {
    const out: any[] = [];
    for (const row of rows || []) {
      if (!row || typeof row !== 'object') continue;
      if (
        Array.isArray(row.hosts) &&
        row.hosts.length &&
        typeof row.hosts[0] === 'string'
      ) {
        for (const addr of row.hosts) {
          out.push({ ...row, address: addr });
        }
        continue;
      }
      if (
        Array.isArray(row.hosts) &&
        row.hosts.length &&
        typeof row.hosts[0] === 'object'
      ) {
        out.push(...this.flattenHostEndpointRows(row.hosts));
        continue;
      }
      out.push(row);
    }
    return out;
  }

  async getPanelHostsByInbound(
    panelId: string,
    inboundId: number,
  ): Promise<
    Array<{
      address?: string | null;
      hosts?: unknown;
      port?: number | null;
      remark?: string | null;
      inboundId?: number | null;
      isDisabled?: boolean;
    }>
  > {
    if (!inboundId) return [];
    try {
      const { base, headers, agent } = await this.getPanelHttpContext(panelId);
      const endpoint = `${base}/panel/api/hosts/byInbound/${inboundId}`;
      const res = await axios.get(endpoint, {
        headers,
        httpsAgent: agent,
        timeout: PANEL_REQUEST_TIMEOUT_MS,
      });
      if (!res.data?.success) return [];
      const rows = Array.isArray(res.data.obj) ? res.data.obj : [];
      return this.flattenHostEndpointRows(rows);
    } catch {
      return [];
    }
  }

  /**
   * VERIFY CLIENT EXISTS using GET /panel/api/clients/get/{email}
   * Returns { exists: true, data } when found.
   * Returns { exists: false } when success:false (record not found).
   * This is the authoritative existence check — do NOT use /traffic/{email}.
   */
  async verifyClientExists(
    panelId: string,
    email: string,
    adminId?: string,
  ): Promise<{
    exists: boolean;
    data?: any;
    error?: string;
    inboundIds?: number[];
  }> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/get/${encodeURIComponent(email)}`;
    const startMs = Date.now();

    this.logger.log(
      `[VERIFY_CLIENT] PANEL_BASE=${base} METHOD=GET URL=${endpoint} ` +
        `IDENTIFIER=email:"${email}"`,
    );

    try {
      const res = await axios.get(endpoint, {
        headers,
        httpsAgent: agent,
        timeout: PANEL_REQUEST_TIMEOUT_MS,
      });
      const durationMs = Date.now() - startMs;
      const exists = res.data?.success === true && res.data?.obj !== null;
      const parsed = exists
        ? this.parseClientGetObj(res.data.obj)
        : { client: null, inboundIds: [] as number[] };
      const inboundIds = parsed.inboundIds;

      this.logger.log(
        `[VERIFY_CLIENT] RESPONSE HTTP=${res.status} success=${res.data?.success} ` +
          `obj=${res.data?.obj !== null ? 'present' : 'null'} exists=${exists} ` +
          `inboundIds=[${inboundIds.join(',')}] duration=${durationMs}ms`,
      );

      await this.logProvisioningEvent({
        operation: 'VERIFY_CLIENT',
        adminId,
        panelId,
        panelName: panel.name,
        email,
        endpoint,
        httpStatus: res.status,
        durationMs,
        success: exists,
        verificationResult: exists,
        errorCode: exists ? undefined : 'VERIFICATION_FAILED',
        errorMessage: exists
          ? undefined
          : res.data?.msg || 'Client not found on panel',
      });

      return {
        exists: exists && !!parsed.client,
        data: exists
          ? { ...res.data.obj, client: parsed.client, inboundIds }
          : undefined,
        inboundIds,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      this.logger.error(
        `[VERIFY_CLIENT] ERROR email=${email} err=${err.message}`,
      );
      return { exists: false, error: err.message, inboundIds: [] };
    }
  }

  /**
   * VERIFY CLIENT IS MISSING (post-delete check) using GET /panel/api/clients/get/{email}
   * Returns true  when client is confirmed absent (success:false from panel).
   * Returns false when client still exists.
   *
   * IMPORTANT: /clients/traffic/{email} returns success:true + obj:null for missing
   * clients (confirmed in live probe). Do NOT use it as a delete sentinel.
   */
  async verifyClientMissing(
    panelId: string,
    email: string,
    adminId?: string,
  ): Promise<boolean> {
    const result = await this.verifyClientExists(panelId, email, adminId);
    return !result.exists;
  }

  /**
   * Post-update verification: panel quota/enable must match expected values
   * before local DB debits or sync accepts panel state.
   */
  async verifyClientPanelState(
    panelId: string,
    email: string,
    expected: { totalBytes?: bigint; enable?: boolean },
    adminId?: string,
  ): Promise<{ verified: boolean; message?: string }> {
    const check = await this.verifyClientExists(panelId, email, adminId);
    if (!check.exists || !check.data) {
      return {
        verified: false,
        message: `Client "${email}" not found on panel after update.`,
      };
    }

    const clientObj = check.data.client ?? check.data;
    const panelTotal = BigInt(
      Math.round(Number(clientObj.totalGB ?? clientObj.total ?? 0)),
    );

    if (expected.totalBytes !== undefined) {
      const tolerance = 1024n;
      const diff =
        panelTotal > expected.totalBytes
          ? panelTotal - expected.totalBytes
          : expected.totalBytes - panelTotal;
      if (diff > tolerance) {
        return {
          verified: false,
          message:
            `Panel total mismatch for ${email}. ` +
            `Expected ${expected.totalBytes} bytes but panel has ${panelTotal}.`,
        };
      }
    }

    if (
      expected.enable !== undefined &&
      Boolean(clientObj.enable) !== expected.enable
    ) {
      return {
        verified: false,
        message:
          `Panel enable mismatch for ${email}. ` +
          `Expected ${expected.enable} but panel has ${clientObj.enable}.`,
      };
    }

    return { verified: true };
  }

  /**
   * RESET CLIENT TRAFFIC using native POST /panel/api/clients/resetTraffic/{email}
   * This replaces the old updateInboundFull() approach which modified clientStats
   * in memory and had no real effect on many 3x-ui versions.
   */
  async resetClientTrafficOnPanel(
    panelId: string,
    email: string,
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } =
      await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/resetTraffic/${encodeURIComponent(email)}`;
    const startMs = Date.now();

    this.logger.log(
      `[RESET_TRAFFIC] PANEL_BASE=${base} METHOD=POST URL=${endpoint} ` +
        `IDENTIFIER=email:"${email}"`,
    );

    try {
      const res = await this.retryRequest(
        () =>
          axios.post(
            endpoint,
            {},
            {
              headers: { ...headers, 'Content-Type': 'application/json' },
              httpsAgent: agent,
              timeout: PANEL_REQUEST_TIMEOUT_MS,
            },
          ),
        `RESET_TRAFFIC email=${email}`,
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(
        `[RESET_TRAFFIC] RESPONSE HTTP=${res.status} success=${ok} ` +
          `msg="${res.data?.msg || ''}" duration=${durationMs}ms`,
      );

      await this.logProvisioningEvent({
        operation: 'RESET_TRAFFIC',
        adminId,
        panelId,
        panelName: panel.name,
        email,
        endpoint,
        httpStatus: res.status,
        durationMs,
        success: ok,
        errorCode: ok ? undefined : 'PANEL_ERROR',
        errorMessage: ok ? undefined : res.data?.msg,
      });

      if (!ok) {
        const panelMsg = res.data?.msg || '';
        const code: ProvisioningErrorCode = panelMsg
          .toLowerCase()
          .includes('record not found')
          ? 'CLIENT_NOT_FOUND'
          : 'PANEL_ERROR';
        return {
          success: false,
          error: {
            code,
            message: panelMsg,
            httpStatus: res.status,
            panelMessage: panelMsg,
            endpoint,
            durationMs,
          },
        };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(
        `[RESET_TRAFFIC] FAILED email=${email} error=${apiError.code}: ${apiError.message}`,
      );
      await this.logProvisioningEvent({
        operation: 'RESET_TRAFFIC',
        adminId,
        panelId,
        panelName: panel.name,
        email,
        endpoint,
        durationMs: apiError.durationMs,
        success: false,
        errorCode: apiError.code,
        errorMessage: apiError.message,
      });
      return { success: false, error: apiError };
    }
  }

  // ─── Legacy shims (kept for backward-compat with callers not yet migrated) ───
  // These now delegate to the new native methods.

  /** @deprecated Use createClientOnPanel() */
  async addClient(panelId: string, _inboundPort: number, settingsPayload: any) {
    throw new BadRequestException(
      'addClient() is deprecated. Callers must use createClientOnPanel() with numeric inbound IDs. ' +
        'Trigger a panel sync to populate panelInboundId fields.',
    );
  }

  /** @deprecated Use updateClientOnPanel() */
  async updateClient(
    panelId: string,
    _inboundPort: number,
    _uuid: string,
    clientPayload: any,
  ) {
    throw new BadRequestException(
      'updateClient() is deprecated and was the source of "Native updateClient failed 404". ' +
        'It called /panel/api/inbounds/updateClient/{UUID} which does not exist. ' +
        'Callers must use updateClientOnPanel(panelId, email, payload).',
    );
  }

  /** @deprecated Use deleteClientOnPanel() */
  async delClient(
    panelId: string,
    _inboundPort: number,
    _uuid: string,
    email?: string,
  ) {
    if (!email)
      throw new BadRequestException(
        'delClient() requires email. Use deleteClientOnPanel().',
      );
    return this.deleteClientOnPanel(panelId, email, undefined, true);
  }

  /** @deprecated Use verifyClientMissing() */
  async verifyClientDeleted(
    panelId: string,
    _inboundPort: number,
    _uuid: string,
    email: string,
  ): Promise<boolean> {
    return this.verifyClientMissing(panelId, email);
  }

  /** @deprecated Use verifyClientExists() */
  async verifyClientState(
    panelId: string,
    _inboundPort: number,
    _uuid: string,
  ): Promise<any | null> {
    this.logger.warn(
      `[DEPRECATED] verifyClientState() called without email. Cannot verify without email. Returning null.`,
    );
    return null;
  }

  /** @deprecated Use resetClientTrafficOnPanel() */
  async resetClientTraffic(
    panelId: string,
    _inboundPort: number,
    email: string,
  ) {
    return this.resetClientTrafficOnPanel(panelId, email);
  }

  // --- Native 3x-ui Group APIs (under /panel/api/clients/groups/*) ---

  async assignClientToGroup(
    panelId: string,
    emails: string[],
    groupName: string,
  ) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = resolvePanelApiBaseUrl(panel);
    try {
      const response = await axios.post(
        `${apiBaseUrl}/panel/api/clients/groups/bulkAdd`,
        {
          emails,
          group: groupName,
        },
        {
          headers: {
            Authorization: panel.apiToken
              ? `Bearer ${panel.apiToken}`
              : undefined,
          },
          timeout: 5000,
        },
      );
      if (!response.data || !response.data.success) {
        throw new Error(
          response.data?.msg || 'Panel API rejected group assignment',
        );
      }
      return response.data;
    } catch (err: any) {
      // Non-fatal: group assignment failure should not block client creation
      this.logger.warn(
        `Failed to assign client(s) to group "${groupName}" on panel ${panelId}: ${err.message}`,
      );
    }
  }

  async removeClientFromGroup(
    panelId: string,
    emails: string[],
    groupName: string,
  ) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = resolvePanelApiBaseUrl(panel);
    try {
      const response = await axios.post(
        `${apiBaseUrl}/panel/api/clients/groups/bulkRemove`,
        {
          emails,
          group: groupName,
        },
        {
          headers: {
            Authorization: panel.apiToken
              ? `Bearer ${panel.apiToken}`
              : undefined,
          },
          timeout: 5000,
        },
      );
      if (!response.data || !response.data.success) {
        throw new Error(
          response.data?.msg || 'Panel API rejected group removal',
        );
      }
      return response.data;
    } catch (err: any) {
      this.logger.warn(
        `Failed to remove client(s) from group "${groupName}" on panel ${panelId}: ${err.message}`,
      );
    }
  }

  async listGroups(panelId: string) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = resolvePanelApiBaseUrl(panel);
    try {
      const response = await axios.get(
        `${apiBaseUrl}/panel/api/clients/groups`,
        {
          headers: {
            Authorization: panel.apiToken
              ? `Bearer ${panel.apiToken}`
              : undefined,
          },
          timeout: 5000,
        },
      );
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.msg || 'Panel API rejected listGroups');
      }
      return response.data.obj || [];
    } catch (err: any) {
      this.logger.warn(
        `Failed to list groups from panel ${panelId}: ${err.message}`,
      );
      return [];
    }
  }

  async deleteGroup(panelId: string, groupName: string) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = resolvePanelApiBaseUrl(panel);
    try {
      const response = await axios.post(
        `${apiBaseUrl}/panel/api/clients/groups/delete`,
        {
          name: groupName,
        },
        {
          headers: {
            Authorization: panel.apiToken
              ? `Bearer ${panel.apiToken}`
              : undefined,
          },
          timeout: 5000,
        },
      );
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.msg || 'Panel API rejected deleteGroup');
      }
      return response.data;
    } catch (err: any) {
      throw new BadRequestException(
        `Failed to delete group on panel: ${err.message}`,
      );
    }
  }

  /**
   * Rename a 3x-ui client group (admin username).
   * Returns: 'renamed' | 'skipped' (group absent) | throws on hard failure.
   * Fallback when /groups/rename is missing: bulkAdd emails to newName + delete old group.
   */
  async renameClientGroup(
    panelId: string,
    oldName: string,
    newName: string,
    opts?: { adminId?: string },
  ): Promise<'renamed' | 'skipped'> {
    if (!oldName || !newName || oldName === newName) return 'skipped';

    const panel = await this.findOne(panelId);
    const apiBaseUrl = resolvePanelApiBaseUrl(panel);
    const panelLabel = panel.name || panelId;
    const authHeaders = {
      Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined,
    };

    // Strict list — unreachable panel must fail the rename (not silent skip).
    let groups: any[] = [];
    try {
      const response = await axios.get(`${apiBaseUrl}/panel/api/clients/groups`, {
        headers: authHeaders,
        timeout: 10000,
      });
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.msg || 'Panel API rejected listGroups');
      }
      groups = response.data.obj || [];
    } catch (err: any) {
      throw new BadRequestException(
        `Panel "${panelLabel}" is unreachable; username was not changed (${err?.response?.data?.msg || err?.message || err})`,
      );
    }

    const hasOld = (groups || []).some((g) => {
      const name = typeof g === 'string' ? g : g?.name || g?.group || '';
      return String(name).toLowerCase() === oldName.toLowerCase();
    });
    if (!hasOld) return 'skipped';

    try {
      const response = await axios.post(
        `${apiBaseUrl}/panel/api/clients/groups/rename`,
        { oldName, newName },
        { headers: authHeaders, timeout: 15000 },
      );
      if (!response.data || !response.data.success) {
        throw new Error(
          response.data?.msg || 'Panel API rejected groups/rename',
        );
      }
      return 'renamed';
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;

      const status = err?.response?.status;
      const missing =
        status === 404 ||
        status === 405 ||
        /not found|unknown|404/i.test(
          String(err?.response?.data?.msg || err?.message || ''),
        );

      if (!missing) {
        throw new BadRequestException(
          `Failed to rename group "${oldName}" → "${newName}" on panel "${panelLabel}": ${err?.response?.data?.msg || err.message}`,
        );
      }

      // Fallback for older panels without /groups/rename
      this.logger.warn(
        `groups/rename unavailable on panel ${panelId}; falling back to bulkAdd + deleteGroup`,
      );
      let emails: string[] = [];
      if (opts?.adminId) {
        const clients = await this.prisma.client.findMany({
          where: { adminId: opts.adminId, panelId },
          select: { email: true },
        });
        emails = clients.map((c) => c.email).filter(Boolean);
      }
      if (emails.length) {
        const add = await axios.post(
          `${apiBaseUrl}/panel/api/clients/groups/bulkAdd`,
          { emails, group: newName },
          { headers: authHeaders, timeout: 15000 },
        );
        if (!add.data?.success) {
          throw new BadRequestException(
            `Fallback bulkAdd failed on panel "${panelLabel}": ${add.data?.msg || 'rejected'}`,
          );
        }
      } else {
        try {
          await axios.post(
            `${apiBaseUrl}/panel/api/clients/groups/create`,
            { name: newName },
            { headers: authHeaders, timeout: 10000 },
          );
        } catch {
          /* may already exist */
        }
      }
      await this.deleteGroup(panelId, oldName);
      return 'renamed';
    }
  }

  async processSuspensions() {
    const now = new Date();

    // 1. Process Admins Entering Grace Period
    const newlyExhausted = await this.prisma.admin.findMany({
      where: {
        trafficMode: 'USAGE',
        unlimitedTraffic: false,
        balance: { lte: 0 },
        gracePeriodStart: null,
        status: 'active',
      },
    });

    for (const admin of newlyExhausted) {
      await this.prisma.admin.update({
        where: { id: admin.id },
        data: { gracePeriodStart: now },
      });
      await this.prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'GRACE_STARTED',
          entity: 'Admin',
          entityId: admin.id,
          details: {
            message: 'Admin balance exhausted. 24h grace period started.',
          },
        },
      });
    }

    // 2. Process Admins Restored (Balance > 0)
    const restoredAdmins = await this.prisma.admin.findMany({
      where: {
        trafficMode: 'USAGE',
        unlimitedTraffic: false,
        balance: { gt: 0 },
        gracePeriodStart: { not: null },
      },
    });

    for (const admin of restoredAdmins) {
      await this.prisma.admin.update({
        where: { id: admin.id },
        data: { gracePeriodStart: null },
      });
      await this.prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'BALANCE_RESTORED',
          entity: 'Admin',
          entityId: admin.id,
          details: {
            message: 'Admin balance restored above zero. Grace period ended.',
          },
        },
      });

      // Batch reactivate clients disabled due to BALANCE_EXHAUSTED
      const clientsToReactivate = await this.prisma.client.findMany({
        where: {
          adminId: admin.id,
          disableReason: 'BALANCE_EXHAUSTED',
          enable: false,
        },
        take: 100,
        include: {
          inbounds: {
            include: {
              inbound: {
                include: {
                  panel: true,
                },
              },
            },
          },
        },
      });

      if (clientsToReactivate.length > 0) {
        for (const client of clientsToReactivate) {
          try {
            if (client.inbounds) {
              for (const ci of client.inbounds) {
                if (ci.inbound) {
                  await this.updateClient(
                    ci.inbound.panelId,
                    ci.inbound.port,
                    client.uuid,
                    { enable: true },
                  );
                }
              }
            }
            await this.prisma.client.update({
              where: { id: client.id },
              data: { enable: true, disableReason: null },
            });
          } catch (error) {
            console.error(`Failed to reactivate client ${client.id}:`, error);
          }
        }
        await this.prisma.auditLog.create({
          data: {
            adminId: admin.id,
            action: 'CLIENTS_REACTIVATED',
            entity: 'Client',
            entityId: admin.id,
            details: {
              message: `Reactivated ${clientsToReactivate.length} clients after balance restoration.`,
            },
          },
        });
      }
    }

    // 3. Process Admins Past Grace Period (Need Suspension)
    const gracePeriodEndMs = now.getTime() - 24 * 60 * 60 * 1000;
    const suspendedAdmins = await this.prisma.admin.findMany({
      where: {
        trafficMode: 'USAGE',
        unlimitedTraffic: false,
        balance: { lte: 0 },
        gracePeriodStart: { lte: new Date(gracePeriodEndMs) },
        status: 'active',
      },
    });

    for (const admin of suspendedAdmins) {
      const clientsToSuspend = await this.prisma.client.findMany({
        where: { adminId: admin.id, enable: true },
        take: 100,
        include: {
          inbounds: {
            include: {
              inbound: {
                include: {
                  panel: true,
                },
              },
            },
          },
        },
      });

      if (clientsToSuspend.length > 0) {
        for (const client of clientsToSuspend) {
          try {
            if (client.inbounds) {
              for (const ci of client.inbounds) {
                if (ci.inbound) {
                  await this.updateClient(
                    ci.inbound.panelId,
                    ci.inbound.port,
                    client.uuid,
                    { enable: false },
                  );
                }
              }
            }
            await this.prisma.client.update({
              where: { id: client.id },
              data: { enable: false, disableReason: 'BALANCE_EXHAUSTED' },
            });
          } catch (error) {
            console.error(`Failed to suspend client ${client.id}:`, error);
          }
        }
        await this.prisma.auditLog.create({
          data: {
            adminId: admin.id,
            action: 'CLIENTS_SUSPENDED',
            entity: 'Client',
            entityId: admin.id,
            details: {
              message: `Suspended ${clientsToSuspend.length} clients due to balance exhaustion.`,
            },
          },
        });
      }
    }
  }
  async getLiveOnlineEmails(panelIds?: string[]): Promise<string[]> {
    const whereClause: any = { status: 'online' };
    if (panelIds && panelIds.length > 0) {
      whereClause.id = { in: panelIds };
    }

    const panels = await this.prisma.panel.findMany({
      where: whereClause,
      select: {
        id: true,
        apiToken: true,
        apiBaseUrl: true,
        url: true,
        panelType: true,
      },
    });

    const onlineEmails = new Set<string>();

    await Promise.all(
      panels.map(async (p) => {
        if (isExternalPanelType(p.panelType)) {
          const driver = this.panelDrivers.get(p.panelType);
          if (!driver?.getOnlines) return;
          if (!(await this.panelGate.canOperate(p))) return;
          try {
            const names = await driver.getOnlines(p.id);
            for (const e of names) {
              if (e) onlineEmails.add(e.trim().toLowerCase());
            }
          } catch (err: any) {
            this.logger.debug(`native onlines failed for ${p.id}: ${err?.message}`);
          }
          return;
        }
        let panelEmails: string[] = [];
        let success = false;
        const apiBaseUrl = resolvePanelApiBaseUrl(p);

        try {
          this.logger.debug(`Fetching live onlines for panel ${p.id}`);
          const res = await axios.post(
            `${apiBaseUrl}/panel/api/inbounds/onlines`,
            {},
            {
              headers: {
                Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined,
              },
              timeout: 5000,
            },
          );

          if (res.data && res.data.success && Array.isArray(res.data.obj)) {
            panelEmails = res.data.obj
              .map((e: string) => e?.trim().toLowerCase())
              .filter(Boolean);
            success = true;
          } else {
            this.logger.debug(
              `Panel ${p.id} onlines API response was not successful:`,
              res.data,
            );
          }
        } catch (err: any) {
          if (err.response?.status === 404) {
            try {
              const listRes = await axios.get(
                `${apiBaseUrl}/panel/api/inbounds/list`,
                {
                  headers: {
                    Authorization: p.apiToken
                      ? `Bearer ${p.apiToken}`
                      : undefined,
                  },
                  timeout: 8000,
                },
              );
              if (
                listRes.data &&
                listRes.data.success &&
                Array.isArray(listRes.data.obj)
              ) {
                const now = Date.now();
                listRes.data.obj.forEach((inb: any) => {
                  if (Array.isArray(inb.clientStats)) {
                    inb.clientStats.forEach((cs: any) => {
                      if (
                        cs.email &&
                        cs.lastOnline &&
                        now - cs.lastOnline < 120000
                      ) {
                        panelEmails.push(cs.email.trim().toLowerCase());
                      }
                    });
                  }
                });
                success = true;
              }
            } catch (fallbackErr: any) {
              this.logger.warn(
                `Fallback inbounds/list failed for panel ${p.id}: ${fallbackErr.message}`,
              );
            }
          } else {
            this.logger.warn(
              `Failed to fetch live onlines for panel ${p.id}: ${err.message}`,
            );
          }
        }

        if (success) {
          this.panelOnlineCache[p.id] = {
            emails: panelEmails,
            timestamp: Date.now(),
          };
          panelEmails.forEach((e) => onlineEmails.add(e));
        } else {
          const cached = this.panelOnlineCache[p.id];
          if (cached && Date.now() - cached.timestamp < 90000) {
            this.logger.debug(`Using cache fallback for panel ${p.id} onlines`);
            cached.emails.forEach((e) => onlineEmails.add(e));
          }
        }
      }),
    );

    return Array.from(onlineEmails);
  }

  async getOnlineClientIps(): Promise<Record<string, number>> {
    const now = Date.now();
    if (now - this.onlineIpsCache.timestamp < 30000) {
      return this.onlineIpsCache.data;
    }

    const panels = await this.prisma.panel.findMany({
      where: { status: 'online' },
      select: { id: true, apiToken: true, apiBaseUrl: true, url: true },
    });

    const result: Record<string, number> = {};

    await Promise.all(
      panels.map(async (p) => {
        try {
          const apiBaseUrl = resolvePanelApiBaseUrl(p);
          const res = await axios.post(
            `${apiBaseUrl}/panel/api/inbounds/clientIps`,
            {},
            {
              headers: {
                Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined,
              },
              timeout: 5000,
            },
          );
          if (
            res.data &&
            res.data.success &&
            typeof res.data.obj === 'object'
          ) {
            for (const [email, ips] of Object.entries(res.data.obj)) {
              if (Array.isArray(ips)) {
                const normalizedEmail = email.trim().toLowerCase();
                result[normalizedEmail] =
                  (result[normalizedEmail] || 0) + ips.length;
              }
            }
          }
        } catch (err) {
          // Soft fail
        }
      }),
    );

    this.onlineIpsCache = { data: result, timestamp: Date.now() };
    return result;
  }
}

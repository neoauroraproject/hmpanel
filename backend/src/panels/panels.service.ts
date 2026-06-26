import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios, { AxiosError } from 'axios';
import * as https from 'https';
import * as crypto from 'crypto';

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
  message: string;        // Human-readable, safe to return to frontend
  httpStatus?: number;
  panelMessage?: string;  // Raw panel error message
  endpoint: string;
  durationMs: number;
}

export interface PanelApiResult {
  success: boolean;
  data?: any;
  error?: PanelApiError;
}

export interface ProvisioningLogEvent {
  operation: 'CREATE_CLIENT' | 'UPDATE_CLIENT' | 'DELETE_CLIENT' | 'RESET_TRAFFIC' | 'VERIFY_CLIENT' | 'SYNC_CLIENT';
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
const PANEL_CONNECT_TIMEOUT_MS  = 10_000;
const PANEL_REQUEST_TIMEOUT_MS  = 30_000;
const PANEL_RETRY_COUNT         = 3;
const PANEL_RETRY_DELAYS_MS     = [500, 1500, 4500] as const; // exponential backoff

@Injectable()
export class PanelsService implements OnModuleInit {
  private readonly logger = new Logger(PanelsService.name);
  private panelOnlineCache: Record<string, { emails: string[], timestamp: number }> = {};
  private onlineIpsCache: { data: Record<string, number>, timestamp: number } = { data: {}, timestamp: 0 };

  constructor(private prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Retry an axios call with exponential backoff. */
  private async retryRequest<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let lastErr: any;
    for (let attempt = 0; attempt <= PANEL_RETRY_COUNT; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.message?.includes('timeout');
        const isNetErr  = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET';
        // Only retry on transient network/timeout errors, not on 4xx responses
        if (!isTimeout && !isNetErr) throw err;
        if (attempt < PANEL_RETRY_COUNT) {
          const delay = PANEL_RETRY_DELAYS_MS[attempt] ?? 4500;
          this.logger.warn(`${label}: attempt ${attempt + 1} failed (${err.code || err.message}), retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  /** Classify an axios error into a structured ProvisioningErrorCode. */
  private classifyError(err: any, endpoint: string, startTime: number): PanelApiError {
    const durationMs = Date.now() - startTime;
    const axiosErr = err as AxiosError;

    if (axiosErr.response) {
      const httpStatus = axiosErr.response.status;
      const body: any = axiosErr.response.data || {};
      const panelMsg: string = body?.msg || body?.message || '';
      const lower = panelMsg.toLowerCase();

      if (httpStatus === 401 || httpStatus === 403) {
        return { code: 'AUTH_FAILURE', message: 'Panel API authentication failed. Check API token.', httpStatus, panelMessage: panelMsg, endpoint, durationMs };
      }
      if (lower.includes('email') && (lower.includes('exist') || lower.includes('duplicate') || lower.includes('already'))) {
        return { code: 'DUPLICATE_EMAIL', message: `Email already exists on the panel: ${panelMsg}`, httpStatus, panelMessage: panelMsg, endpoint, durationMs };
      }
      if (lower.includes('uuid') && (lower.includes('exist') || lower.includes('duplicate'))) {
        return { code: 'DUPLICATE_UUID', message: `UUID collision on panel: ${panelMsg}`, httpStatus, panelMessage: panelMsg, endpoint, durationMs };
      }
      if (lower.includes('inbound') && (lower.includes('not found') || lower.includes('404'))) {
        return { code: 'INBOUND_NOT_FOUND', message: `Inbound not found on panel: ${panelMsg}`, httpStatus, panelMessage: panelMsg, endpoint, durationMs };
      }
      if (lower.includes('client') && lower.includes('not found')) {
        return { code: 'CLIENT_NOT_FOUND', message: `Client not found on panel: ${panelMsg}`, httpStatus, panelMessage: panelMsg, endpoint, durationMs };
      }
      return { code: 'PANEL_ERROR', message: `Panel error (HTTP ${httpStatus}): ${panelMsg || 'No message'}`, httpStatus, panelMessage: panelMsg, endpoint, durationMs };
    }

    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
      return { code: 'TIMEOUT', message: `Panel did not respond within ${PANEL_REQUEST_TIMEOUT_MS / 1000}s. Operation cancelled.`, endpoint, durationMs };
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return { code: 'NETWORK_ERROR', message: `Cannot reach panel: ${err.message}`, endpoint, durationMs };
    }
    if (err instanceof BadRequestException) {
      const resp = err.getResponse() as any;
      const msg = typeof resp === 'string' ? resp : resp?.message || err.message;
      // Re-classify duplicate email thrown from our own addClient logic
      if (msg?.toLowerCase().includes('already exists')) {
        return { code: 'DUPLICATE_EMAIL', message: msg, endpoint, durationMs };
      }
      return { code: 'PANEL_ERROR', message: msg, endpoint, durationMs };
    }
    return { code: 'UNKNOWN', message: err.message || 'Unknown error', endpoint, durationMs };
  }

  /** Emit a structured provisioning log event to Logger and AuditLog. */
  private async logProvisioningEvent(event: ProvisioningLogEvent): Promise<void> {
    const level = event.success ? 'log' : 'warn';
    this.logger[level](
      `[PROVISION:${event.operation}] panel=${event.panelId} email=${event.email} ` +
      `endpoint=${event.endpoint} status=${event.httpStatus ?? 'N/A'} ` +
      `duration=${event.durationMs}ms success=${event.success}` +
      (event.errorCode ? ` error=${event.errorCode}: ${event.errorMessage}` : '') +
      (event.verificationResult !== undefined ? ` verified=${event.verificationResult}` : '')
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
  async resolveNumericInboundIds(inboundDbIds: string[]): Promise<{ id: string; panelId: string; panelInboundId: number; port: number }[]> {
    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: inboundDbIds } },
      select: { id: true, panelId: true, panelInboundId: true, port: true },
    });
    const missing = inbounds.filter(i => i.panelInboundId === null);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Panel sync required before creating clients. The following inbounds have not been synced yet: ` +
        `${missing.map(i => i.id).join(', ')}. Please trigger a panel sync and retry.`
      );
    }
    return inbounds as { id: string; panelId: string; panelInboundId: number; port: number }[];
  }



  async onModuleInit() {
    this.logger.log('Starting auto-sync for all panels on boot...');
    this.syncAllPanelsInBackground();
  }

  private async syncAllPanelsInBackground() {
    try {
      const panels = await this.prisma.panel.findMany();
      for (const p of panels) {
        this.sync(p.id).catch(e => this.logger.error(`Boot sync failed for panel ${p.name}:`, e.message));
      }
      this.logger.log(`Triggered background sync for ${panels.length} panels.`);
    } catch (error: any) {
      this.logger.error('Failed to trigger background sync on boot', error.message);
    }
  }

  private async discoverCapabilities(apiBaseUrl: string, apiToken?: string) {
    const caps = {
      clientsApi: false,
      pagination: false,
      apiToken: !!apiToken,
      slimInbounds: false,
      observatory: false,
      websocket: false,
    };
    const headers = { Authorization: apiToken ? `Bearer ${apiToken}` : undefined };

    try {
      const cRes = await axios.get(`${apiBaseUrl}/panel/api/clients/list`, { headers, timeout: 3000 });
      if (cRes.data && cRes.data.success !== undefined) caps.clientsApi = true;
    } catch {}

    try {
      const pRes = await axios.get(`${apiBaseUrl}/panel/api/clients/list/paged`, { headers, timeout: 3000 });
      if (pRes.data && pRes.data.success !== undefined) caps.pagination = true;
    } catch {}

    try {
      const oRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/options`, { headers, timeout: 3000 });
      if (oRes.data && oRes.data.success !== undefined) caps.slimInbounds = true;
    } catch {}

    try {
      const obsRes = await axios.get(`${apiBaseUrl}/panel/api/server/xrayObservatory`, { headers, timeout: 3000 });
      if (obsRes.data && obsRes.data.success !== undefined) caps.observatory = true;
    } catch {}

    return caps;
  }

  async testConnection(data: { url: string; apiToken?: string; panelId?: string }) {
    if (data.panelId && !data.apiToken) {
      const panel = await this.prisma.panel.findUnique({ where: { id: data.panelId } });
      if (panel && panel.apiToken) data.apiToken = panel.apiToken;
    }

    if (!data.url || !/^https?:\/\//.test(data.url)) {
      throw new BadRequestException('A valid http(s) URL is required');
    }
    let urlObj: URL;
    try {
      urlObj = new URL(data.url);
    } catch {
      throw new BadRequestException('Malformed URL');
    }

    const parsedHost = urlObj.hostname;
    const parsedPort = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    
    let path = urlObj.pathname.replace(/\/$/, '');
    let webBasePath = '';
    const panelIndex = path.indexOf('/panel');
    if (panelIndex !== -1) {
      webBasePath = path.substring(0, panelIndex);
    } else {
      webBasePath = path;
    }

    const baseUrl = urlObj.origin;
    const apiBaseUrl = `${baseUrl}${webBasePath}`;

    const startTime = Date.now();
    
    const checklist = {
      sslValid: true,
      apiReachable: false,
      authPassed: false,
      panelDetected: false,
      versionSupported: false,
    };

    const debugLog = {
      requestedUrl: data.url,
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
        headers: { Authorization: data.apiToken ? `Bearer ${data.apiToken}` : undefined },
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
          const inboundsRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/list`, {
            headers: { Authorization: data.apiToken ? `Bearer ${data.apiToken}` : undefined },
            timeout: 5000,
          });
          if (inboundsRes.data && inboundsRes.data.success) {
            const apiInbounds = inboundsRes.data.obj || [];
            inboundCount = apiInbounds.length;
            for (const apiInbound of apiInbounds) {
              const settings = typeof apiInbound.settings === 'string' ? JSON.parse(apiInbound.settings) : apiInbound.settings;
              const clientsList = settings?.clients || [];
              clientCount += clientsList.length;
            }
          }
        } catch (inboundsErr: any) {
          // Soft failure on inbounds
        }

        const capabilities = await this.discoverCapabilities(apiBaseUrl, data.apiToken);

        return {
          ok: true,
          checklist,
          version: panelVersion,
          xrayVersion: xrayVersion,
          capabilities,
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
        if (msgLower.includes('token') || msgLower.includes('auth') || msgLower.includes('login')) {
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
        
        if (axiosErr.response.status === 401 || axiosErr.response.status === 403) {
          checklist.authPassed = false;
          errorType = 'Unauthorized';
          exactError = 'Invalid API Token or Credentials';
        } else if (axiosErr.response.status === 404) {
          checklist.panelDetected = false;
          errorType = 'API Version Unsupported';
          exactError = 'Endpoint /panel/api/server/status not found. Is this 3x-ui?';
        } else {
          errorType = 'API Version Unsupported';
          exactError = `HTTP ${axiosErr.response.status}`;
        }
      } else if (axiosErr.request) {
        // Network error
        checklist.apiReachable = false;
        if (axiosErr.code === 'ECONNABORTED' || err.message.includes('timeout')) {
          errorType = 'Timeout';
          exactError = 'Connection timed out. Check firewall and routing.';
        } else if (axiosErr.code === 'CERT_HAS_EXPIRED' || err.message.toLowerCase().includes('ssl') || err.message.toLowerCase().includes('cert')) {
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

  async register(data: { serverId?: string; name: string; url: string; subUrl?: string; apiToken?: string; username?: string; password?: string }) {
    const authMode = data.apiToken ? 'token' : 'credentials';
    if (authMode === 'credentials' && (!data.username || !data.password)) {
      throw new BadRequestException('Username and password required for credential auth');
    }

    let serverId = data.serverId;
    if (!serverId) {
      let server = await this.prisma.server.findFirst({ select: { id: true } });
      if (!server) {
        server = await this.prisma.server.create({
          data: {
            name: 'Local Server',
            ipAddress: '127.0.0.1'
          },
          select: { id: true }
        });
      }
      serverId = server.id;
    }

    let urlObj: URL;
    try {
      urlObj = new URL(data.url);
    } catch {
      throw new BadRequestException('Malformed URL');
    }
    let path = urlObj.pathname.replace(/\/$/, '');
    let webBasePath = '';
    const panelIndex = path.indexOf('/panel');
    if (panelIndex !== -1) {
      webBasePath = path.substring(0, panelIndex);
    } else {
      webBasePath = path;
    }
    const apiBaseUrl = `${urlObj.origin}${webBasePath}`;

    let formattedSubUrl = null;
    if (data.subUrl && data.subUrl.trim() !== '') {
      formattedSubUrl = data.subUrl.trim();
      if (!formattedSubUrl.startsWith('https://')) {
        throw new BadRequestException('Subscription URL must start with https://');
      }
      if (!formattedSubUrl.endsWith('/')) {
        formattedSubUrl += '/';
      }
    } else {
      throw new BadRequestException('Subscription URL is required');
    }

    const testResult = await this.testConnection({ url: data.url, apiToken: data.apiToken });
    const caps = testResult.capabilities || {
      clientsApi: false,
      pagination: false,
      apiToken: !!data.apiToken,
      slimInbounds: false,
      observatory: false,
      websocket: false,
    };

    const panel = await this.prisma.panel.create({
      data: {
        serverId,
        name: data.name,
        url: data.url.replace(/\/$/, ''),
        subUrl: formattedSubUrl,
        version: 'unknown',
        apiToken: data.apiToken,
        username: data.username,
        password: data.password,
        authMode,
        status: 'online',
        panelType: '3x-ui',
        webBasePath,
        apiBaseUrl,
        capClientsApi: caps.clientsApi,
        capPagination: caps.pagination,
        capApiToken: caps.apiToken,
        capSlimInbounds: caps.slimInbounds,
        capObservatory: caps.observatory,
        capWebsocket: caps.websocket,
      },
    });

    try {
      const syncReport = await this.sync(panel.id);
      
      await this.prisma.auditLog.create({
        data: { action: 'PANEL_REGISTERED', entity: 'Panel', entityId: panel.id, details: { url: panel.url } }
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
        }
      };
    }
  }

  async findAll() {
    const panels = await this.prisma.panel.findMany({
      select: {
        id: true, name: true, url: true, subUrl: true, version: true, authMode: true, status: true, createdAt: true,
        inboundCount: true, clientCount: true, lastSync: true, lastOnline: true, panelType: true,
        server: { select: { id: true, name: true, ipAddress: true } },
        syncState: { select: { lastSync: true, wsConnected: true, latencyMs: true, status: true } },
        _count: { select: { inbounds: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return panels;
  }

  async findOne(id: string) {
    const panel = await this.prisma.panel.findUnique({
      where: { id },
      include: {
        server: { select: { id: true, name: true, ipAddress: true } },
        inbounds: { select: { id: true, tag: true, port: true, protocol: true, _count: { select: { clientInbounds: true } } } },
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
        port: true,
        protocol: true,
        panel: { select: { id: true, name: true } },
      },
    });
    return dbInbounds;
  }

  async update(id: string, data: { name?: string; url?: string; subUrl?: string; apiToken?: string; status?: string }) {
    await this.findOne(id);
    let formattedSubUrl: string | undefined | null = undefined;
    if (data.subUrl !== undefined) {
      if (data.subUrl && data.subUrl.trim() !== '') {
        formattedSubUrl = data.subUrl.trim();
        if (!formattedSubUrl.startsWith('https://')) {
          throw new BadRequestException('Subscription URL must start with https://');
        }
        if (!formattedSubUrl.endsWith('/')) {
          formattedSubUrl += '/';
        }
      } else {
        throw new BadRequestException('Subscription URL is required');
      }
    }

    return this.prisma.panel.update({
      where: { id },
      data: {
        name: data.name,
        url: data.url ? data.url.replace(/\/$/, '') : undefined,
        subUrl: formattedSubUrl,
        apiToken: data.apiToken,
        status: data.status,
      },
      select: { id: true, name: true, url: true, subUrl: true, version: true, authMode: true, status: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const inbounds = await this.prisma.inbound.findMany({
      where: { panelId: id },
      select: { id: true }
    });
    const inboundIds = inbounds.map((i) => i.id);

    const clients = await this.prisma.client.findMany({
      where: {
        inbounds: {
          some: {
            inboundId: { in: inboundIds }
          }
        }
      },
      include: {
        inbounds: true
      }
    });

    const clientIdsToDelete = [];
    const clientInboundIdsToDelete = [];

    for (const c of clients) {
      const thisPanelInbounds = c.inbounds.filter(ci => inboundIds.includes(ci.inboundId));
      const otherPanelInbounds = c.inbounds.filter(ci => !inboundIds.includes(ci.inboundId));
      
      if (otherPanelInbounds.length === 0) {
        clientIdsToDelete.push(c.id);
      } else {
        for (const ci of thisPanelInbounds) {
          clientInboundIdsToDelete.push({ clientId: c.id, inboundId: ci.inboundId });
        }
      }
    }

    if (clientInboundIdsToDelete.length > 0) {
      for (const item of clientInboundIdsToDelete) {
        await this.prisma.clientInbound.delete({
          where: {
            clientId_inboundId: {
              clientId: item.clientId,
              inboundId: item.inboundId
            }
          }
        }).catch(() => {});
      }
    }

    if (clientIdsToDelete.length > 0) {
      await this.prisma.trafficTransaction.deleteMany({
        where: { clientId: { in: clientIdsToDelete } }
      });
      await this.prisma.client.deleteMany({
        where: { id: { in: clientIdsToDelete } }
      });
    }

    await this.prisma.panel.delete({ where: { id } });
    return { deleted: true };
  }

  async sync(id: string) {
    const panel = await this.findOne(id);
    const startTime = Date.now();
    const apiBaseUrl = panel.apiBaseUrl || panel.url.replace(/\/$/, '');

    this.logger.debug(`[DIAGNOSTIC] Start Sync for panel ${id} (${panel.name}) at ${apiBaseUrl}`);

    try {
      this.logger.debug(`[DIAGNOSTIC] GET /panel/api/server/status`);
      const statusRes = await axios.get(`${apiBaseUrl}/panel/api/server/status`, {
        headers: { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined },
        timeout: 5000,
      });
      
      this.logger.debug(`[DIAGNOSTIC] Response /server/status | HTTP ${statusRes.status} | success: ${statusRes.data?.success} | msg: ${statusRes.data?.msg} | obj type: ${typeof statusRes.data?.obj}`);

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

      // Feature discovery
      const caps = await this.discoverCapabilities(apiBaseUrl, panel.apiToken || undefined);
      await this.prisma.panel.update({
        where: { id: panel.id },
        data: {
          capClientsApi: caps.clientsApi,
          capPagination: caps.pagination,
          capApiToken: caps.apiToken,
          capSlimInbounds: caps.slimInbounds,
          capObservatory: caps.observatory,
          capWebsocket: caps.websocket,
          version,
        }
      });

      // --- Group Sync & Conflict Detection ---
      try {
        const apiGroups = await this.listGroups(id);
        const apiGroupNames = new Set(apiGroups.map((g: any) => String(g.name)));
        
        const resellers = await this.prisma.admin.findMany({
          where: { role: 'RESELLER' },
          select: { id: true, username: true }
        });

        const resellerNames = new Set(resellers.map(a => a.username));

        for (const admin of resellers) {
          if (!apiGroupNames.has(admin.username)) {
            // Reseller has no matching group in panel — will be auto-created on next client add
            this.logger.debug(`Group for reseller ${admin.username} does not exist in panel ${id} yet.`);
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
                details: { message: `Group "${groupName}" exists in panel but has no matching reseller locally.` }
              }
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to sync groups for panel ${id}: ${err.message}`);
      }
      // --- End Group Sync ---

      let apiInbounds = [];
      let unifiedClients: any[] = [];

      const headers = { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined };

      if (caps.clientsApi) {
        const inboundsUrl = caps.slimInbounds ? '/panel/api/inbounds/list/slim' : '/panel/api/inbounds/list';
        this.logger.debug(`[DIAGNOSTIC] GET ${inboundsUrl}`);
        const inboundsRes = await axios.get(`${apiBaseUrl}${inboundsUrl}`, { headers, timeout: PANEL_REQUEST_TIMEOUT_MS });
        this.logger.debug(`[DIAGNOSTIC] Response ${inboundsUrl} | HTTP ${inboundsRes.status} | success: ${inboundsRes.data?.success} | msg: ${inboundsRes.data?.msg} | obj length: ${Array.isArray(inboundsRes.data?.obj) ? inboundsRes.data.obj.length : typeof inboundsRes.data?.obj}`);
        if (!inboundsRes.data || !inboundsRes.data.success) throw new Error(inboundsRes.data?.msg || 'Failed to fetch inbounds');
        apiInbounds = inboundsRes.data.obj || [];

        this.logger.debug(`[DIAGNOSTIC] GET /panel/api/clients/list`);
        const clientsRes = await axios.get(`${apiBaseUrl}/panel/api/clients/list`, { headers, timeout: PANEL_REQUEST_TIMEOUT_MS });
        this.logger.debug(`[DIAGNOSTIC] Response /clients/list | HTTP ${clientsRes.status} | success: ${clientsRes.data?.success} | msg: ${clientsRes.data?.msg} | obj length: ${Array.isArray(clientsRes.data?.obj) ? clientsRes.data.obj.length : typeof clientsRes.data?.obj}`);
        if (!clientsRes.data || !clientsRes.data.success) throw new Error(clientsRes.data?.msg || 'Failed to fetch clients');
        const apiClientsList = clientsRes.data.obj || [];
        
        this.logger.debug(`[DIAGNOSTIC] Parsing ${apiClientsList.length} clients from /clients/list`);
        
        for (const c of apiClientsList) {
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
            inboundIds: c.inboundIds || []
          });
        }
      } else {
        this.logger.debug(`[DIAGNOSTIC] GET /panel/api/inbounds/list (Legacy parsing)`);
        const inboundsRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/list`, { headers, timeout: PANEL_REQUEST_TIMEOUT_MS });
        this.logger.debug(`[DIAGNOSTIC] Response /inbounds/list | HTTP ${inboundsRes.status} | success: ${inboundsRes.data?.success} | msg: ${inboundsRes.data?.msg} | obj length: ${Array.isArray(inboundsRes.data?.obj) ? inboundsRes.data.obj.length : typeof inboundsRes.data?.obj}`);
        if (!inboundsRes.data || !inboundsRes.data.success) throw new Error(inboundsRes.data?.msg || 'Failed to fetch inbounds');
        apiInbounds = inboundsRes.data.obj || [];
        
        this.logger.debug(`[DIAGNOSTIC] Parsing legacy inbounds list with length: ${apiInbounds.length}`);

        for (const apiInbound of apiInbounds) {
          const settings = typeof apiInbound.settings === 'string' ? JSON.parse(apiInbound.settings) : apiInbound.settings;
          const clientsList = settings?.clients || [];
          const clientStats = apiInbound.clientStats || [];
          const statsMap = new Map();
          for (const stat of clientStats) {
            if (stat.email) statsMap.set(stat.email.trim(), stat);
          }

          for (const c of clientsList) {
            const trimmedEmail = (c.email || '').trim() || `client-${(c.id || '').slice(0, 8)}`;
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
              inboundIds: [apiInbound.id]
            });
          }
        }
      }

      this.logger.debug(`[DIAGNOSTIC] Starting Database operations: ${apiInbounds.length} inbounds, ${unifiedClients.length} clients`);
      
      let totalSyncedInbounds = 0;
      let totalSyncedClients = 0;
      let panelUpDelta = 0n;
      let panelDownDelta = 0n;
      
      const apiEmails = new Set<string>();
      const syncReport = { created: 0, updated: 0, skipped: 0, failed: 0, repaired: 0 };

      const admins = await this.prisma.admin.findMany({ select: { id: true, username: true } });
      const adminMap = new Map<string, string>();
      for (const admin of admins) { adminMap.set(admin.username.toLowerCase(), admin.id); }

      const apiInboundIdToDbId = new Map<number, string>();

      // 1. Sync Inbounds
      this.logger.debug(`[DIAGNOSTIC] Syncing ${apiInbounds.length} inbounds into Database`);
      for (const apiInbound of apiInbounds) {
        totalSyncedInbounds++;
        const settings = typeof apiInbound.settings === 'string' ? JSON.parse(apiInbound.settings || '{}') : (apiInbound.settings || {});
        const streamSettings = typeof apiInbound.streamSettings === 'string' ? JSON.parse(apiInbound.streamSettings || '{}') : (apiInbound.streamSettings || {});

        let dbInbound = await this.prisma.inbound.findFirst({
          where: { panelId: panel.id, port: apiInbound.port }
        });

        if (!dbInbound) {
          dbInbound = await this.prisma.inbound.create({
            data: {
              panelId: panel.id,
              panelInboundId: apiInbound.id, // persist numeric ID for native client APIs
              tag: apiInbound.remark || `inbound-${apiInbound.port}`,
              port: apiInbound.port,
              protocol: apiInbound.protocol,
              settings,
              streamSettings,
            }
          });
        } else {
          dbInbound = await this.prisma.inbound.update({
            where: { id: dbInbound.id },
            data: {
              panelInboundId: apiInbound.id, // always keep in sync
              tag: apiInbound.remark || dbInbound.tag,
              protocol: apiInbound.protocol,
              settings,
              streamSettings,
            }
          });
        }
        apiInboundIdToDbId.set(apiInbound.id, dbInbound.id);
      }

      // 2. Sync Clients
      const adminUsageCharges = new Map<string, bigint>();

      this.logger.debug(`[DIAGNOSTIC] Syncing ${unifiedClients.length} clients into Database`);

      const processedEmails = new Set<string>();

      for (const unifiedClient of unifiedClients) {
        totalSyncedClients++;
        if (!unifiedClient.uuid && !unifiedClient.email) continue; // safety check
        
        const trimmedEmail = (unifiedClient.email || `client-${String(unifiedClient.uuid || '').slice(0, 8)}`).trim();
        
        if (processedEmails.has(trimmedEmail)) {
          this.logger.warn(`[SYNC] Panel ${panel.name} returned duplicate client email: ${trimmedEmail}. Skipping.`);
          syncReport.skipped++;
          continue;
        }
        processedEmails.add(trimmedEmail);
        apiEmails.add(trimmedEmail);

        try {
          let dbClient = await this.prisma.client.findUnique({
            where: { panelId_email: { panelId: panel.id, email: trimmedEmail } },
            include: { admin: true, inbounds: true }
          });

          const up = BigInt(unifiedClient.up || 0);
          const down = BigInt(unifiedClient.down || 0);
          const total = BigInt(unifiedClient.total || 0);
          const expiryTime = BigInt(unifiedClient.expiryTime || 0);
          const enable = unifiedClient.enable;

        let resolvedAdminId = dbClient?.adminId || null;
        if (unifiedClient.group) {
          resolvedAdminId = adminMap.get(unifiedClient.group.toLowerCase()) || null;
        }

        const localInboundIds = (unifiedClient.inboundIds || [])
          .map((id: number) => apiInboundIdToDbId.get(id))
          .filter(Boolean) as string[];

        // If client doesn't exist locally at all:
        if (!dbClient) {
          this.logger.log(`[SYNC_DECISION] email="${trimmedEmail}" panelId="${panel.id}" existingDBRecord=NONE decision=CREATE`);
          await this.prisma.client.create({
            data: {
              panelId: panel.id,
              uuid: unifiedClient.uuid || crypto.randomUUID(), // Ensure UUID is always generated
              subId: unifiedClient.subId || null,
              subToken: crypto.randomBytes(5).toString('hex'),
              email: trimmedEmail,
              adminId: resolvedAdminId,
              enable, up, down, total, expiryTime,
              flow: unifiedClient.flow || null,
              inbounds: {
                create: localInboundIds.map((id: string) => ({ inboundId: id }))
              }
            }
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

          if (delta > 0n && dbClient.admin && dbClient.admin.trafficMode === 'USAGE' && dbClient.adminId) {
            const currentCharge = adminUsageCharges.get(dbClient.adminId) || 0n;
            adminUsageCharges.set(dbClient.adminId, currentCharge + delta);
          }

          // Conflict Detection (Ignore up/down normal usage)
          const changes = [];
          if (dbClient.enable !== enable) changes.push(`enable: ${dbClient.enable} -> ${enable}`);
          if (dbClient.total !== total) changes.push(`total: ${dbClient.total} -> ${total}`);
          if (dbClient.expiryTime !== expiryTime) changes.push(`expiryTime: ${dbClient.expiryTime} -> ${expiryTime}`);

          if (changes.length > 0) {
            await this.prisma.auditLog.create({
              data: {
                action: 'SYNC_CONFLICT_RESOLVED',
                entity: 'Client',
                entityId: dbClient.id,
                details: { message: 'Panel state overwrote DB state', changes }
              }
            });
          }

          const changedData: any = {};
          if (dbClient.uuid !== unifiedClient.uuid && unifiedClient.uuid) {
            changedData.uuid = unifiedClient.uuid;
            syncReport.repaired++;
          }
          if (dbClient.email !== trimmedEmail) changedData.email = trimmedEmail;
          if (unifiedClient.subId && dbClient.subId !== unifiedClient.subId) changedData.subId = unifiedClient.subId;
          if (dbClient.adminId !== resolvedAdminId) changedData.adminId = resolvedAdminId;
          if (dbClient.enable !== enable) {
            changedData.enable = enable;
            if (!enable) {
              const usedNew = up + down;
              if (total > 0n && usedNew >= total) changedData.disableReason = 'TRAFFIC_LIMIT';
              else if (expiryTime > 0n && BigInt(Date.now()) >= expiryTime) changedData.disableReason = 'EXPIRED';
              else changedData.disableReason = 'MANUAL';
            } else {
              changedData.disableReason = null;
            }
          }
          if (dbClient.up !== up) changedData.up = up;
          if (dbClient.down !== down) changedData.down = down;
          if (dbClient.total !== total) changedData.total = total;
          if (dbClient.expiryTime !== expiryTime) changedData.expiryTime = expiryTime;
          if (dbClient.flow !== unifiedClient.flow) changedData.flow = unifiedClient.flow;

          if (Object.keys(changedData).length > 0) {
            await this.prisma.client.update({
              where: { id: dbClient.id },
              data: changedData
            });
          }

          // Sync ClientInbound relations
          const existingInbounds = dbClient.inbounds.map(i => i.inboundId);
          const toAdd = localInboundIds.filter((id: string) => !existingInbounds.includes(id));
          const toRemove = existingInbounds.filter(id => !localInboundIds.includes(id));

          if (toRemove.length > 0) {
            await this.prisma.clientInbound.deleteMany({
              where: { clientId: dbClient.id, inboundId: { in: toRemove } }
            });
          }
          if (toAdd.length > 0) {
            await this.prisma.clientInbound.createMany({
              data: toAdd.map((id: string) => ({ clientId: dbClient.id!, inboundId: id }))
            });
          }
        }
        } catch (clientErr: any) {
          syncReport.failed++;
          this.logger.error(`[SYNC] Failed to sync client ${trimmedEmail} on panel ${panel.id}: ${clientErr.message}`);
        }
      }

      this.logger.log(`[SYNC] Panel ${panel.name} Sync Report: Created=${syncReport.created}, Updated=${syncReport.updated}, Repaired=${syncReport.repaired}, Skipped=${syncReport.skipped}, Failed=${syncReport.failed}`);

      // Apply Usage Charges for USAGE mode admins
      for (const [adminId, totalDelta] of adminUsageCharges.entries()) {
        if (totalDelta < 1048576n) continue; // Ignore extremely small entries (< 1MB)

        const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
        if (admin) {
          await this.prisma.admin.update({
            where: { id: adminId },
            data: { balance: { decrement: Number(totalDelta) } }
          });
          
          const ONE_DAY = 24 * 60 * 60 * 1000;
          const latestTx = await this.prisma.trafficTransaction.findFirst({
            where: { adminId, type: 'USAGE_CHARGE' },
            orderBy: { createdAt: 'desc' }
          });

          if (latestTx && (Date.now() - latestTx.createdAt.getTime() < ONE_DAY)) {
            await this.prisma.trafficTransaction.update({
              where: { id: latestTx.id },
              data: { 
                amount: latestTx.amount + totalDelta,
                balanceAfter: admin.balance - Number(totalDelta)
              }
            });
          } else {
            await this.prisma.trafficTransaction.create({
              data: {
                adminId,
                amount: totalDelta,
                type: 'USAGE_CHARGE',
                action: 'DAILY_USAGE_CHARGE',
                description: `Daily Summarized Usage Charge`,
                balanceBefore: admin.balance,
                balanceAfter: admin.balance - Number(totalDelta)
              }
            });
          }
        }
      }

        // Orphan Cleanup
        const dbClientsInPanel = await this.prisma.client.findMany({
          where: { panelId: panel.id },
          include: { admin: true }
        });
  
        for (const dbC of dbClientsInPanel) {
          if (!apiEmails.has(dbC.email)) {
            // Client was deleted directly on the panel.
            // Since the client is now scoped to this panel, we simply delete it from the DB.
            await this.prisma.$transaction(async (tx) => {
              const stillExists = await tx.client.findUnique({ where: { id: dbC.id } });
              if (!stillExists) return;

              await tx.client.delete({ where: { id: dbC.id } });
            });
            
            await this.prisma.auditLog.create({
              data: {
                action: 'SYNC_ORPHAN_DELETED',
                entity: 'Client',
                entityId: dbC.id,
                details: { message: 'Client deleted directly on panel. Removed from DB.' }
              }
            });
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
        }
      });

      await this.prisma.panel.update({
        where: { id },
        data: { 
          status: 'online', 
          version,
          lastOnline: new Date(),
          lastSync: new Date(),
          inboundCount: totalSyncedInbounds,
          clientCount: apiEmails.size,
          syncState: {
            upsert: {
              create: { lastSync: new Date(), status: 'success', latencyMs: latencyMs },
              update: { lastSync: new Date(), status: 'success', latencyMs: latencyMs }
            }
          }
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'SYNC_COMPLETED',
          entity: 'Panel',
          entityId: id,
          details: { message: 'Panel synchronization completed successfully', inboundCount: totalSyncedInbounds, clientCount: apiEmails.size }
        }
      });

      const dbClientCount = await this.prisma.client.count({
        where: {
          inbounds: {
            some: {
              inbound: {
                panelId: id
              }
            }
          }
        }
      });
      const discrepancies = dbClientCount - totalSyncedClients;
      const discrepancyMsg = discrepancies === 0 
        ? "Perfect Match" 
        : `Found ${Math.abs(discrepancies)} ${discrepancies > 0 ? "extra DB clients" : "missing DB clients"}`;

      this.logger.log(`Sync complete for Panel ${id}. API: ${totalSyncedClients}, DB: ${dbClientCount}. ${discrepancyMsg}`);

      const syncDurationMs = Date.now() - startTime;
      
      await this.prisma.auditLog.create({
        data: { action: 'PANEL_SYNC_SUCCESS', entity: 'Panel', entityId: id, details: { syncedInbounds: totalSyncedInbounds, syncedClients: totalSyncedClients, latencyMs } }
      });

      this.logger.debug(`[DIAGNOSTIC] Sync Finished successfully`);

      return {
        success: true,
        version,
        syncedInbounds: totalSyncedInbounds,
        syncedClients: totalSyncedClients,
        dbClientCount,
        discrepancyMsg,
        syncDurationMs,
      };

    } catch (err: any) {
      this.logger.error(`[DIAGNOSTIC] Sync failed with exception: ${err.message}`, err.stack);
      
      await this.prisma.panel.update({
        where: { id },
        data: { status: 'offline' },
      });

      await this.prisma.syncState.upsert({
        where: { panelId: id },
        create: { panelId: id, lastSync: new Date(), lastPolledAt: new Date(), wsConnected: false, status: 'failure', errorLogs: err.message },
        update: { lastPolledAt: new Date(), wsConnected: false, status: 'failure', errorLogs: err.message },
      });

      await this.prisma.auditLog.create({
        data: { action: 'PANEL_SYNC_FAILURE', entity: 'Panel', entityId: id, details: { error: err.message } }
      });

      throw new BadRequestException(`Sync failed: ${err.message}`);
    }
  }

  async restartXray(id: string) {
    const panel = await this.findOne(id);
    const apiBaseUrl = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
    try {
      const response = await axios.post(`${apiBaseUrl}/panel/api/server/restartXrayService`, {}, {
        headers: { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined },
        timeout: 5000,
      });
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
    const lines = logs.map(l => `[${l.createdAt.toISOString()}] [${l.action}] ${l.details ? JSON.stringify(l.details) : ''}`);
    
    return {
      panel: panel.name,
      lines: lines.length > 0 ? lines : ['No internal logs available yet.'],
    };
  }

  private getHttpsAgent() {
    return new https.Agent({ rejectUnauthorized: false });
  }

  private updateQueues = new Map<string, Promise<any>>();

  async updateInboundFull(panelId: string, inboundPort: number, modifier: (inbound: any) => void) {
    const lockKey = `${panelId}:${inboundPort}`;
    const prev = this.updateQueues.get(lockKey) || Promise.resolve();
    
    const next = (async () => {
      try { await prev; } catch (e) {} // Wait for previous task regardless of its outcome
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

  private async _doUpdateInboundFull(panelId: string, inboundPort: number, modifier: (inbound: any) => void) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
    const headers = { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined };
    const httpsAgent = this.getHttpsAgent();

    const listRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/list`, { headers, httpsAgent, timeout: 5000 });
    if (!listRes.data || !listRes.data.success) throw new Error('Failed to list inbounds');
    const inboundList = listRes.data.obj || [];
    const inboundMeta = inboundList.find((i: any) => i.port === inboundPort);
    if (!inboundMeta) throw new Error(`Inbound with port ${inboundPort} not found on panel`);

    const getRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/get/${inboundMeta.id}`, { headers, httpsAgent, timeout: 5000 });
    if (!getRes.data || !getRes.data.success) throw new Error('Failed to fetch full inbound data');
    const inbound = getRes.data.obj;

    modifier(inbound);

    if (typeof inbound.settings === 'object') {
      inbound.settings = JSON.stringify(inbound.settings);
    }
    if (typeof inbound.streamSettings === 'object') {
      inbound.streamSettings = JSON.stringify(inbound.streamSettings);
    }

    const updateRes = await axios.post(`${apiBaseUrl}/panel/api/inbounds/update/${inbound.id}`, inbound, { headers, httpsAgent, timeout: 5000 });
    if (!updateRes.data || !updateRes.data.success) throw new Error(updateRes.data?.msg || 'Failed to update inbound');
    
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
    const base    = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
    const headers = { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined };
    const agent   = this.getHttpsAgent();
    return { panel, base, headers, agent };
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
      tgId?: number;
      enable?: boolean;
      flow?: string;
      subId?: string;
      comment?: string;
      reset?: number;
    },
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } = await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/add`;
    const body     = { client: clientPayload, inboundIds: numericInboundIds };
    const startMs  = Date.now();

    this.logger.log(
      `[CREATE_CLIENT] PANEL_BASE=${base} METHOD=POST URL=${endpoint} ` +
      `IDENTIFIER=email:"${clientPayload.email}" ` +
      `INBOUND_IDS=${JSON.stringify(numericInboundIds)} ` +
      `PAYLOAD_SIZE=${JSON.stringify(body).length}B`
    );

    try {
      const res = await this.retryRequest(() =>
        axios.post(endpoint, body, {
          headers: { ...headers, 'Content-Type': 'application/json' },
          httpsAgent: agent,
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        }), `CREATE_CLIENT email=${clientPayload.email}`
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(
        `[CREATE_CLIENT] RESPONSE HTTP=${res.status} success=${ok} ` +
        `msg="${res.data?.msg || ''}" duration=${durationMs}ms`
      );

      await this.logProvisioningEvent({
        operation: 'CREATE_CLIENT', adminId, panelId, panelName: panel.name,
        email: clientPayload.email, endpoint,
        requestSizeBytes: JSON.stringify(body).length,
        httpStatus: res.status, durationMs, success: ok,
        errorCode: ok ? undefined : 'PANEL_ERROR',
        errorMessage: ok ? undefined : res.data?.msg,
      });

      if (!ok) {
        const panelMsg: string = res.data?.msg || '';
        const lower = panelMsg.toLowerCase();
        let code: ProvisioningErrorCode = 'PANEL_ERROR';
        if (lower.includes('email') && (lower.includes('exist') || lower.includes('duplicate') || lower.includes('already') || lower.includes('required'))) code = 'DUPLICATE_EMAIL';
        else if (lower.includes('uuid') && lower.includes('exist')) code = 'DUPLICATE_UUID';
        else if (lower.includes('record not found') || lower.includes('inbound')) code = 'INBOUND_NOT_FOUND';
        return { success: false, error: { code, message: panelMsg, httpStatus: res.status, panelMessage: panelMsg, endpoint, durationMs } };
      }
      return { success: true, data: res.data };

    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(`[CREATE_CLIENT] FAILED email=${clientPayload.email} error=${apiError.code}: ${apiError.message}`);
      await this.logProvisioningEvent({
        operation: 'CREATE_CLIENT', adminId, panelId, panelName: panel.name,
        email: clientPayload.email, endpoint,
        requestSizeBytes: JSON.stringify(body).length,
        durationMs: apiError.durationMs, success: false,
        errorCode: apiError.code, errorMessage: apiError.message,
      });
      return { success: false, error: apiError };
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
    const { panel, base, headers, agent } = await this.getPanelHttpContext(panelId);
    
    // 1. Fetch existing full client to avoid overwriting password/security/etc with empty values
    const getEndpoint = `${base}/panel/api/clients/get/${encodeURIComponent(email)}`;
    const startMs  = Date.now();
    let existingClientObj: any = {};
    try {
      const getRes = await this.retryRequest(() =>
        axios.get(getEndpoint, { headers, httpsAgent: agent, timeout: PANEL_REQUEST_TIMEOUT_MS }),
        `GET_CLIENT email=${email}`
      );
      if (getRes.data?.success && getRes.data?.obj?.client) {
        existingClientObj = getRes.data.obj.client;
      } else {
        return { success: false, error: { code: 'CLIENT_NOT_FOUND', message: getRes.data?.msg || 'Client not found', httpStatus: getRes.status, endpoint: getEndpoint, durationMs: 0 } };
      }
    } catch (err: any) {
      const apiError = this.classifyError(err, getEndpoint, startMs);
      return { success: false, error: apiError };
    }

    const endpoint = `${base}/panel/api/clients/update/${encodeURIComponent(email)}`;
    // Build the update body: merge existing client fields with new payload.
    // Ensure we do NOT send inboundIds to this endpoint as per 3.3.1 API.
    const body: Record<string, any> = { ...existingClientObj, ...clientPayload, email };
    delete body.inboundIds;

    this.logger.log(
      `[UPDATE_CLIENT] PANEL_BASE=${base} METHOD=POST URL=${endpoint} ` +
      `IDENTIFIER=email:"${email}" ` +
      `PAYLOAD_SIZE=${JSON.stringify(body).length}B`
    );

    try {
      const res = await this.retryRequest(() =>
        axios.post(endpoint, body, {
          headers: { ...headers, 'Content-Type': 'application/json' },
          httpsAgent: agent,
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        }), `UPDATE_CLIENT email=${email}`
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(
        `[UPDATE_CLIENT] RESPONSE HTTP=${res.status} success=${ok} ` +
        `msg="${res.data?.msg || ''}" duration=${durationMs}ms`
      );

      await this.logProvisioningEvent({
        operation: 'UPDATE_CLIENT', adminId, panelId, panelName: panel.name,
        email, endpoint,
        requestSizeBytes: JSON.stringify(body).length,
        httpStatus: res.status, durationMs, success: ok,
        errorCode: ok ? undefined : 'PANEL_ERROR',
        errorMessage: ok ? undefined : res.data?.msg,
      });

      if (!ok) {
        const panelMsg: string = res.data?.msg || '';
        const lower = panelMsg.toLowerCase();
        const isNotFound = lower.includes('record not found') || lower.includes('not found');

        // CLIENT_NOT_FOUND on UPDATE is a real error — the client was unexpectedly missing.
        // Do NOT treat it as success. Only deleteClientOnPanel() treats not-found as idempotent.
        const code: ProvisioningErrorCode = isNotFound ? 'CLIENT_NOT_FOUND' : 'PANEL_ERROR';
        this.logger.warn(
          `[UPDATE_CLIENT] Client ${email} update failed: ${panelMsg} (code=${code})`
        );
        return { success: false, error: { code, message: panelMsg, httpStatus: res.status, panelMessage: panelMsg, endpoint, durationMs } };
      }
      return { success: true, data: res.data };

    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(`[UPDATE_CLIENT] FAILED email=${email} error=${apiError.code}: ${apiError.message}`);
      await this.logProvisioningEvent({
        operation: 'UPDATE_CLIENT', adminId, panelId, panelName: panel.name,
        email, endpoint, durationMs: apiError.durationMs, success: false,
        errorCode: apiError.code, errorMessage: apiError.message,
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
    const { panel, base, headers, agent } = await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/${encodeURIComponent(email)}/attach`;
    const body = { inboundIds };
    const startMs = Date.now();

    this.logger.log(`[ATTACH_INBOUNDS] PANEL_BASE=${base} METHOD=POST URL=${endpoint} IDENTIFIER=email:"${email}" INBOUND_IDS=[${inboundIds.join(',')}]`);

    try {
      const res = await this.retryRequest(() =>
        axios.post(endpoint, body, {
          headers: { ...headers, 'Content-Type': 'application/json' },
          httpsAgent: agent,
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        }), `ATTACH_INBOUNDS email=${email}`
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(`[ATTACH_INBOUNDS] RESPONSE HTTP=${res.status} success=${ok} msg="${res.data?.msg || ''}" duration=${durationMs}ms`);

      if (!ok) {
        return { success: false, error: { code: 'PANEL_ERROR', message: res.data?.msg || '', httpStatus: res.status, panelMessage: res.data?.msg, endpoint, durationMs } };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(`[ATTACH_INBOUNDS] FAILED email=${email} error=${apiError.code}: ${apiError.message}`);
      return { success: false, error: apiError };
    }
  }

  async detachInboundsFromClient(
    panelId: string,
    email: string,
    inboundIds: number[],
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } = await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/${encodeURIComponent(email)}/detach`;
    const body = { inboundIds };
    const startMs = Date.now();

    this.logger.log(`[DETACH_INBOUNDS] PANEL_BASE=${base} METHOD=POST URL=${endpoint} IDENTIFIER=email:"${email}" INBOUND_IDS=[${inboundIds.join(',')}]`);

    try {
      const res = await this.retryRequest(() =>
        axios.post(endpoint, body, {
          headers: { ...headers, 'Content-Type': 'application/json' },
          httpsAgent: agent,
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        }), `DETACH_INBOUNDS email=${email}`
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(`[DETACH_INBOUNDS] RESPONSE HTTP=${res.status} success=${ok} msg="${res.data?.msg || ''}" duration=${durationMs}ms`);

      if (!ok) {
        return { success: false, error: { code: 'PANEL_ERROR', message: res.data?.msg || '', httpStatus: res.status, panelMessage: res.data?.msg, endpoint, durationMs } };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(`[DETACH_INBOUNDS] FAILED email=${email} error=${apiError.code}: ${apiError.message}`);
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
    const { panel, base, headers, agent } = await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/del/${encodeURIComponent(email)}`;
    const startMs  = Date.now();

    this.logger.log(
      `[DELETE_CLIENT] PANEL_BASE=${base} METHOD=POST URL=${endpoint} ` +
      `IDENTIFIER=email:"${email}" isRollback=${isRollback}`
    );

    try {
      const res = await this.retryRequest(() =>
        axios.post(endpoint, {}, {
          headers: { ...headers, 'Content-Type': 'application/json' },
          httpsAgent: agent,
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        }), `DELETE_CLIENT email=${email}`
      );

      const durationMs = Date.now() - startMs;
      const panelMsg: string = res.data?.msg || '';
      const lower = panelMsg.toLowerCase();
      const notFound = lower.includes('not found');
      const ok = res.data?.success === true || notFound;

      this.logger.log(
        `[DELETE_CLIENT] RESPONSE HTTP=${res.status} success=${res.data?.success} ` +
        `msg="${panelMsg}" notFound=${notFound} effectiveOk=${ok} duration=${durationMs}ms`
      );

      await this.logProvisioningEvent({
        operation: 'DELETE_CLIENT', adminId, panelId, panelName: panel.name,
        email, endpoint,
        httpStatus: res.status, durationMs, success: ok,
        errorCode: (!ok && notFound) ? 'CLIENT_NOT_FOUND' : (!ok ? 'PANEL_ERROR' : undefined),
        errorMessage: ok ? undefined : panelMsg,
      });

      if (!ok) {
        const code: ProvisioningErrorCode = notFound ? 'CLIENT_NOT_FOUND' : 'PANEL_ERROR';
        return { success: false, error: { code, message: panelMsg, httpStatus: res.status, panelMessage: panelMsg, endpoint, durationMs } };
      }
      return { success: true, data: res.data };

    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(`[DELETE_CLIENT] FAILED email=${email} error=${apiError.code}: ${apiError.message}`);
      await this.logProvisioningEvent({
        operation: 'DELETE_CLIENT', adminId, panelId, panelName: panel.name,
        email, endpoint, durationMs: apiError.durationMs, success: false,
        errorCode: apiError.code, errorMessage: apiError.message,
      });
      return { success: false, error: apiError };
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
  ): Promise<{ exists: boolean; data?: any; error?: string; inboundIds?: number[] }> {
    const { panel, base, headers, agent } = await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/get/${encodeURIComponent(email)}`;
    const startMs  = Date.now();

    this.logger.log(
      `[VERIFY_CLIENT] PANEL_BASE=${base} METHOD=GET URL=${endpoint} ` +
      `IDENTIFIER=email:"${email}"`
    );

    try {
      const res = await axios.get(endpoint, {
        headers, httpsAgent: agent, timeout: PANEL_REQUEST_TIMEOUT_MS,
      });
      const durationMs = Date.now() - startMs;
      const exists = res.data?.success === true && res.data?.obj !== null;
      const inboundIds = exists ? res.data?.obj?.inboundIds || [] : [];

      this.logger.log(
        `[VERIFY_CLIENT] RESPONSE HTTP=${res.status} success=${res.data?.success} ` +
        `obj=${res.data?.obj !== null ? 'present' : 'null'} exists=${exists} ` +
        `inboundIds=[${inboundIds.join(',')}] duration=${durationMs}ms`
      );

      await this.logProvisioningEvent({
        operation: 'VERIFY_CLIENT', adminId, panelId, panelName: panel.name,
        email, endpoint, httpStatus: res.status, durationMs,
        success: exists, verificationResult: exists,
        errorCode: exists ? undefined : 'VERIFICATION_FAILED',
        errorMessage: exists ? undefined : (res.data?.msg || 'Client not found on panel'),
      });

      return { exists, data: exists ? res.data.obj : undefined, inboundIds };
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      this.logger.error(`[VERIFY_CLIENT] ERROR email=${email} err=${err.message}`);
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
   * RESET CLIENT TRAFFIC using native POST /panel/api/clients/resetTraffic/{email}
   * This replaces the old updateInboundFull() approach which modified clientStats
   * in memory and had no real effect on many 3x-ui versions.
   */
  async resetClientTrafficOnPanel(
    panelId: string,
    email: string,
    adminId?: string,
  ): Promise<PanelApiResult> {
    const { panel, base, headers, agent } = await this.getPanelHttpContext(panelId);
    const endpoint = `${base}/panel/api/clients/resetTraffic/${encodeURIComponent(email)}`;
    const startMs  = Date.now();

    this.logger.log(
      `[RESET_TRAFFIC] PANEL_BASE=${base} METHOD=POST URL=${endpoint} ` +
      `IDENTIFIER=email:"${email}"`
    );

    try {
      const res = await this.retryRequest(() =>
        axios.post(endpoint, {}, {
          headers: { ...headers, 'Content-Type': 'application/json' },
          httpsAgent: agent,
          timeout: PANEL_REQUEST_TIMEOUT_MS,
        }), `RESET_TRAFFIC email=${email}`
      );

      const durationMs = Date.now() - startMs;
      const ok = res.data?.success === true;

      this.logger.log(
        `[RESET_TRAFFIC] RESPONSE HTTP=${res.status} success=${ok} ` +
        `msg="${res.data?.msg || ''}" duration=${durationMs}ms`
      );

      await this.logProvisioningEvent({
        operation: 'RESET_TRAFFIC', adminId, panelId, panelName: panel.name,
        email, endpoint, httpStatus: res.status, durationMs, success: ok,
        errorCode: ok ? undefined : 'PANEL_ERROR',
        errorMessage: ok ? undefined : res.data?.msg,
      });

      if (!ok) {
        const panelMsg = res.data?.msg || '';
        const code: ProvisioningErrorCode = panelMsg.toLowerCase().includes('record not found') ? 'CLIENT_NOT_FOUND' : 'PANEL_ERROR';
        return { success: false, error: { code, message: panelMsg, httpStatus: res.status, panelMessage: panelMsg, endpoint, durationMs } };
      }
      return { success: true, data: res.data };

    } catch (err: any) {
      const apiError = this.classifyError(err, endpoint, startMs);
      this.logger.error(`[RESET_TRAFFIC] FAILED email=${email} error=${apiError.code}: ${apiError.message}`);
      await this.logProvisioningEvent({
        operation: 'RESET_TRAFFIC', adminId, panelId, panelName: panel.name,
        email, endpoint, durationMs: apiError.durationMs, success: false,
        errorCode: apiError.code, errorMessage: apiError.message,
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
      'Trigger a panel sync to populate panelInboundId fields.'
    );
  }

  /** @deprecated Use updateClientOnPanel() */
  async updateClient(panelId: string, _inboundPort: number, _uuid: string, clientPayload: any) {
    throw new BadRequestException(
      'updateClient() is deprecated and was the source of "Native updateClient failed 404". ' +
      'It called /panel/api/inbounds/updateClient/{UUID} which does not exist. ' +
      'Callers must use updateClientOnPanel(panelId, email, payload).'
    );
  }

  /** @deprecated Use deleteClientOnPanel() */
  async delClient(panelId: string, _inboundPort: number, _uuid: string, email?: string) {
    if (!email) throw new BadRequestException('delClient() requires email. Use deleteClientOnPanel().');
    return this.deleteClientOnPanel(panelId, email, undefined, true);
  }

  /** @deprecated Use verifyClientMissing() */
  async verifyClientDeleted(panelId: string, _inboundPort: number, _uuid: string, email: string): Promise<boolean> {
    return this.verifyClientMissing(panelId, email);
  }

  /** @deprecated Use verifyClientExists() */
  async verifyClientState(panelId: string, _inboundPort: number, _uuid: string): Promise<any | null> {
    this.logger.warn(`[DEPRECATED] verifyClientState() called without email. Cannot verify without email. Returning null.`);
    return null;
  }

  /** @deprecated Use resetClientTrafficOnPanel() */
  async resetClientTraffic(panelId: string, _inboundPort: number, email: string) {
    return this.resetClientTrafficOnPanel(panelId, email);
  }


  // --- Native 3x-ui Group APIs (under /panel/api/clients/groups/*) ---

  async assignClientToGroup(panelId: string, emails: string[], groupName: string) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
    try {
      const response = await axios.post(`${apiBaseUrl}/panel/api/clients/groups/bulkAdd`, {
        emails,
        group: groupName,
      }, {
        headers: { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined },
        timeout: 5000,
      });
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.msg || 'Panel API rejected group assignment');
      }
      return response.data;
    } catch (err: any) {
      // Non-fatal: group assignment failure should not block client creation
      this.logger.warn(`Failed to assign client(s) to group "${groupName}" on panel ${panelId}: ${err.message}`);
    }
  }

  async removeClientFromGroup(panelId: string, emails: string[], groupName: string) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
    try {
      const response = await axios.post(`${apiBaseUrl}/panel/api/clients/groups/bulkRemove`, {
        emails,
        group: groupName,
      }, {
        headers: { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined },
        timeout: 5000,
      });
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.msg || 'Panel API rejected group removal');
      }
      return response.data;
    } catch (err: any) {
      this.logger.warn(`Failed to remove client(s) from group "${groupName}" on panel ${panelId}: ${err.message}`);
    }
  }

  async listGroups(panelId: string) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
    try {
      const response = await axios.get(`${apiBaseUrl}/panel/api/clients/groups`, {
        headers: { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined },
        timeout: 5000,
      });
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.msg || 'Panel API rejected listGroups');
      }
      return response.data.obj || [];
    } catch (err: any) {
      this.logger.warn(`Failed to list groups from panel ${panelId}: ${err.message}`);
      return [];
    }
  }

  async deleteGroup(panelId: string, groupName: string) {
    const panel = await this.findOne(panelId);
    const apiBaseUrl = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
    try {
      const response = await axios.post(`${apiBaseUrl}/panel/api/clients/groups/delete`, {
        name: groupName,
      }, {
        headers: { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined },
        timeout: 5000,
      });
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.msg || 'Panel API rejected deleteGroup');
      }
      return response.data;
    } catch (err: any) {
      throw new BadRequestException(`Failed to delete group on panel: ${err.message}`);
    }
  }


  async processSuspensions() {
    const now = new Date();
    
    // 1. Process Admins Entering Grace Period
    const newlyExhausted = await this.prisma.admin.findMany({
      where: {
        trafficMode: 'USAGE',
        balance: { lte: 0 },
        gracePeriodStart: null,
        status: 'active'
      }
    });

    for (const admin of newlyExhausted) {
      await this.prisma.admin.update({
        where: { id: admin.id },
        data: { gracePeriodStart: now }
      });
      await this.prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'GRACE_STARTED',
          entity: 'Admin',
          entityId: admin.id,
          details: { message: 'Admin balance exhausted. 24h grace period started.' }
        }
      });
    }

    // 2. Process Admins Restored (Balance > 0)
    const restoredAdmins = await this.prisma.admin.findMany({
      where: {
        trafficMode: 'USAGE',
        balance: { gt: 0 },
        gracePeriodStart: { not: null }
      }
    });

    for (const admin of restoredAdmins) {
      await this.prisma.admin.update({
        where: { id: admin.id },
        data: { gracePeriodStart: null }
      });
      await this.prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'BALANCE_RESTORED',
          entity: 'Admin',
          entityId: admin.id,
          details: { message: 'Admin balance restored above zero. Grace period ended.' }
        }
      });

      // Batch reactivate clients disabled due to BALANCE_EXHAUSTED
      const clientsToReactivate = await this.prisma.client.findMany({
        where: { adminId: admin.id, disableReason: 'BALANCE_EXHAUSTED', enable: false },
        take: 100,
        include: {
          inbounds: {
            include: {
              inbound: {
                include: {
                  panel: true
                }
              }
            }
          }
        }
      });

      if (clientsToReactivate.length > 0) {
        for (const client of clientsToReactivate) {
          try {
            if (client.inbounds) {
              for (const ci of client.inbounds) {
                if (ci.inbound) {
                  await this.updateClient(ci.inbound.panelId, ci.inbound.port, client.uuid, { enable: true });
                }
              }
            }
            await this.prisma.client.update({
              where: { id: client.id },
              data: { enable: true, disableReason: null }
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
            details: { message: `Reactivated ${clientsToReactivate.length} clients after balance restoration.` }
          }
        });
      }
    }

    // 3. Process Admins Past Grace Period (Need Suspension)
    const gracePeriodEndMs = now.getTime() - 24 * 60 * 60 * 1000;
    const suspendedAdmins = await this.prisma.admin.findMany({
      where: {
        trafficMode: 'USAGE',
        balance: { lte: 0 },
        gracePeriodStart: { lte: new Date(gracePeriodEndMs) },
        status: 'active'
      }
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
                  panel: true
                }
              }
            }
          }
        }
      });

      if (clientsToSuspend.length > 0) {
        for (const client of clientsToSuspend) {
          try {
            if (client.inbounds) {
              for (const ci of client.inbounds) {
                if (ci.inbound) {
                  await this.updateClient(ci.inbound.panelId, ci.inbound.port, client.uuid, { enable: false });
                }
              }
            }
            await this.prisma.client.update({
              where: { id: client.id },
              data: { enable: false, disableReason: 'BALANCE_EXHAUSTED' }
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
            details: { message: `Suspended ${clientsToSuspend.length} clients due to balance exhaustion.` }
          }
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
      select: { id: true, apiToken: true, apiBaseUrl: true, url: true }
    });

    const onlineEmails = new Set<string>();

    await Promise.all(panels.map(async (p) => {
      let panelEmails: string[] = [];
      let success = false;
      const apiBaseUrl = p.apiBaseUrl || p.url.replace(/\/$/, '');

      try {
        this.logger.debug(`Fetching live onlines for panel ${p.id}`);
        const res = await axios.post(`${apiBaseUrl}/panel/api/inbounds/onlines`, {}, {
          headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined },
          timeout: 5000,
        });

        if (res.data && res.data.success && Array.isArray(res.data.obj)) {
          panelEmails = res.data.obj.map((e: string) => e?.trim().toLowerCase()).filter(Boolean);
          success = true;
        } else {
          this.logger.debug(`Panel ${p.id} onlines API response was not successful:`, res.data);
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          try {
            const listRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/list`, {
              headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined },
              timeout: 8000,
            });
            if (listRes.data && listRes.data.success && Array.isArray(listRes.data.obj)) {
              const now = Date.now();
              listRes.data.obj.forEach((inb: any) => {
                if (Array.isArray(inb.clientStats)) {
                  inb.clientStats.forEach((cs: any) => {
                    if (cs.email && cs.lastOnline && (now - cs.lastOnline < 120000)) {
                      panelEmails.push(cs.email.trim().toLowerCase());
                    }
                  });
                }
              });
              success = true;
            }
          } catch (fallbackErr: any) {
            this.logger.warn(`Fallback inbounds/list failed for panel ${p.id}: ${fallbackErr.message}`);
          }
        } else {
          this.logger.warn(`Failed to fetch live onlines for panel ${p.id}: ${err.message}`);
        }
      }

      if (success) {
        this.panelOnlineCache[p.id] = { emails: panelEmails, timestamp: Date.now() };
        panelEmails.forEach(e => onlineEmails.add(e));
      } else {
        const cached = this.panelOnlineCache[p.id];
        if (cached && Date.now() - cached.timestamp < 90000) {
          this.logger.debug(`Using cache fallback for panel ${p.id} onlines`);
          cached.emails.forEach(e => onlineEmails.add(e));
        }
      }
    }));

    return Array.from(onlineEmails);
  }

  async getOnlineClientIps(): Promise<Record<string, number>> {
    const now = Date.now();
    if (now - this.onlineIpsCache.timestamp < 30000) {
      return this.onlineIpsCache.data;
    }

    const panels = await this.prisma.panel.findMany({
      where: { status: 'online' },
      select: { id: true, apiToken: true, apiBaseUrl: true, url: true }
    });

    const result: Record<string, number> = {};

    await Promise.all(panels.map(async (p) => {
      try {
        const apiBaseUrl = p.apiBaseUrl || p.url.replace(/\/$/, '');
        const res = await axios.post(`${apiBaseUrl}/panel/api/inbounds/clientIps`, {}, {
          headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined },
          timeout: 5000,
        });
        if (res.data && res.data.success && typeof res.data.obj === 'object') {
          for (const [email, ips] of Object.entries(res.data.obj)) {
            if (Array.isArray(ips)) {
              const normalizedEmail = email.trim().toLowerCase();
              result[normalizedEmail] = (result[normalizedEmail] || 0) + ips.length;
            }
          }
        }
      } catch (err) {
        // Soft fail
      }
    }));

    this.onlineIpsCache = { data: result, timestamp: Date.now() };
    return result;
  }
}

import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios, { AxiosError } from 'axios';
import * as https from 'https';
import * as crypto from 'crypto';

@Injectable()
export class PanelsService implements OnModuleInit {
  private readonly logger = new Logger(PanelsService.name);
  constructor(private prisma: PrismaService) {}

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
      const server = await this.prisma.server.findFirst({ select: { id: true } });
      if (!server) throw new BadRequestException('No server available to attach the panel to');
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

    try {
      const statusRes = await axios.get(`${apiBaseUrl}/panel/api/server/status`, {
        headers: { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined },
        timeout: 5000,
      });

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
        const inboundsRes = await axios.get(`${apiBaseUrl}${inboundsUrl}`, { headers, timeout: 8000 });
        if (!inboundsRes.data || !inboundsRes.data.success) throw new Error(inboundsRes.data?.msg || 'Failed to fetch inbounds');
        apiInbounds = inboundsRes.data.obj || [];

        const clientsRes = await axios.get(`${apiBaseUrl}/panel/api/clients/list`, { headers, timeout: 8000 });
        if (!clientsRes.data || !clientsRes.data.success) throw new Error(clientsRes.data?.msg || 'Failed to fetch clients');
        const apiClientsList = clientsRes.data.obj || [];
        
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
        const inboundsRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/list`, { headers, timeout: 8000 });
        if (!inboundsRes.data || !inboundsRes.data.success) throw new Error(inboundsRes.data?.msg || 'Failed to fetch inbounds');
        apiInbounds = inboundsRes.data.obj || [];

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

      let totalSyncedInbounds = 0;
      let totalSyncedClients = 0;
      let panelUpDelta = 0n;
      let panelDownDelta = 0n;
      
      const apiUuids = new Set<string>();

      const admins = await this.prisma.admin.findMany({ select: { id: true, username: true } });
      const adminMap = new Map<string, string>();
      for (const admin of admins) { adminMap.set(admin.username.toLowerCase(), admin.id); }

      const apiInboundIdToDbId = new Map<number, string>();

      // 1. Sync Inbounds
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

      for (const unifiedClient of unifiedClients) {
        totalSyncedClients++;
        if (!unifiedClient.uuid) continue; // safety check
        apiUuids.add(unifiedClient.uuid);
        
        let dbClient = await this.prisma.client.findUnique({
          where: { uuid: unifiedClient.uuid },
          include: { admin: true, inbounds: true }
        });

        const trimmedEmail = unifiedClient.email || `client-${unifiedClient.uuid.slice(0, 8)}`;
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
          await this.prisma.client.create({
            data: {
              uuid: unifiedClient.uuid,
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
        } else {
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
      }

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
              data: { amount: latestTx.amount + totalDelta }
            });
          } else {
            await this.prisma.trafficTransaction.create({
              data: {
                adminId,
                amount: totalDelta,
                type: 'USAGE_CHARGE',
                description: `Daily Summarized Usage Charge`
              }
            });
          }
        }
      }

        // Orphan Cleanup
        const dbClientsInPanel = await this.prisma.client.findMany({
          where: {
            inbounds: {
              some: {
                inbound: {
                  panelId: id
                }
              }
            }
          },
          include: { admin: true }
        });
  
        for (const dbC of dbClientsInPanel) {
          const dbCAdmin = (dbC as any).admin;
          if (!apiUuids.has(dbC.uuid)) {
            // Client was deleted directly on the panel.
            // Check if this client is still assigned to other inbounds elsewhere.
            const remainingCount = await this.prisma.clientInbound.count({
              where: { clientId: dbC.id }
            });
            if (remainingCount === 0) {
              if (dbCAdmin && dbCAdmin.trafficMode === 'ALLOCATION') {
                const used = dbC.up + dbC.down;
                const remaining = dbC.total - used;
                if (remaining > 0n && dbC.total >= used) {
                  await this.prisma.admin.update({ where: { id: dbCAdmin.id }, data: { balance: { increment: Number(remaining) } } });
                  await this.prisma.trafficTransaction.create({
                    data: {
                      adminId: dbCAdmin.id,
                      clientId: dbC.id,
                      amount: remaining,
                      type: 'CREDIT',
                      description: 'Orphaned Client Deletion Refund',
                    }
                  });
                }
              }
            
              await this.prisma.trafficTransaction.deleteMany({ where: { clientId: dbC.id } });
              await this.prisma.client.delete({ where: { id: dbC.id } });
              
              await this.prisma.auditLog.create({
                data: {
                  action: 'SYNC_ORPHAN_DELETED',
                  entity: 'Client',
                  entityId: dbC.id,
                  details: { message: 'Client deleted directly on panel. Removed from DB.' }
                }
              });
            } else {
              await this.prisma.auditLog.create({
                data: {
                  action: 'SYNC_INBOUND_DELETED',
                  entity: 'Client',
                  entityId: dbC.id,
                  details: { message: `Client removed from panel ${id} but remains assigned to other inbounds.` }
                }
              });
            }
          }
        }

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
          clientCount: apiUuids.size,
          syncState: {
            upsert: {
              create: { lastSync: new Date(), status: 'success', latencyMs: latencyMs },
              update: { lastSync: new Date(), status: 'success', latencyMs: latencyMs }
            }
          }
        },
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

  async updateInboundFull(panelId: string, inboundPort: number, modifier: (inbound: any) => void) {
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

  async addClient(panelId: string, inboundPort: number, settingsPayload: any) {
    try {
      return await this.updateInboundFull(panelId, inboundPort, (inbound) => {
        if (!inbound.settings) inbound.settings = { clients: [] };
        else if (typeof inbound.settings === 'string') inbound.settings = JSON.parse(inbound.settings);
        if (!inbound.settings.clients) inbound.settings.clients = [];
        
        if (settingsPayload && settingsPayload.clients) {
          inbound.settings.clients.push(...settingsPayload.clients);
        }
      });
    } catch (err: any) {
      throw new BadRequestException(`Failed to add client to panel: ${err.message}`);
    }
  }

  async updateClient(panelId: string, inboundPort: number, uuid: string, clientPayload: any) {
    try {
      const panel = await this.findOne(panelId);
      const apiBaseUrl = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
      const headers = { Authorization: panel.apiToken ? `Bearer ${panel.apiToken}` : undefined };
      const httpsAgent = this.getHttpsAgent();

      // First, get the inbound ID for this port
      const listRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/list`, { headers, httpsAgent, timeout: 5000 });
      if (!listRes.data || !listRes.data.success) throw new Error('Failed to list inbounds');
      const inboundList = listRes.data.obj || [];
      const inboundMeta = inboundList.find((i: any) => i.port === inboundPort);
      if (!inboundMeta) throw new Error(`Inbound with port ${inboundPort} not found on panel`);

      // Native 3x-ui client update endpoint expects application/x-www-form-urlencoded
      const formData = new URLSearchParams();
      formData.append('id', inboundMeta.id.toString());
      formData.append('settings', JSON.stringify({ clients: [clientPayload] }));

      let response: any;
      try {
        response = await axios.post(`${apiBaseUrl}/panel/api/inbounds/updateClient/${uuid}`, formData.toString(), {
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          httpsAgent,
          timeout: 5000
        });
      } catch (err: any) {
        console.warn(`Native updateClient failed for ${uuid}, falling back... Error: ${err.message}`);
      }

      if (!response || !response.data || !response.data.success) {
        // Fallback to updateInboundFull if native endpoint fails (e.g. older versions)
        return await this.updateInboundFull(panelId, inboundPort, (inbound) => {
          if (!inbound.settings) return;
          if (typeof inbound.settings === 'string') inbound.settings = JSON.parse(inbound.settings);
          if (!inbound.settings.clients) return;
          
          const clientIndex = inbound.settings.clients.findIndex((c: any) => c.id === uuid);
          if (clientIndex === -1) throw new Error(`Client with UUID ${uuid} not found in inbound`);
          
          inbound.settings.clients[clientIndex] = { ...inbound.settings.clients[clientIndex], ...clientPayload };
        });
      }
      return response.data;
    } catch (err: any) {
      throw new BadRequestException(`Failed to update client on panel: ${err.message}`);
    }
  }

  async delClient(panelId: string, inboundPort: number, uuid: string) {
    try {
      return await this.updateInboundFull(panelId, inboundPort, (inbound) => {
        if (!inbound.settings) return;
        if (typeof inbound.settings === 'string') inbound.settings = JSON.parse(inbound.settings);
        if (!inbound.settings.clients) return;
        
        inbound.settings.clients = inbound.settings.clients.filter((c: any) => c.id !== uuid);
      });
    } catch (err: any) {
      throw new BadRequestException(`Failed to delete client from panel: ${err.message}`);
    }
  }

  async resetClientTraffic(panelId: string, inboundPort: number, email: string) {
    try {
      return await this.updateInboundFull(panelId, inboundPort, (inbound) => {
        if (!inbound.clientStats) return;
        const stat = inbound.clientStats.find((s: any) => s.email === email);
        if (stat) {
          stat.up = 0;
          stat.down = 0;
        }
      });
    } catch (err: any) {
      throw new BadRequestException(`Failed to reset client traffic on panel: ${err.message}`);
    }
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
      try {
        const apiBaseUrl = p.apiBaseUrl || p.url.replace(/\/$/, '');
        this.logger.debug(`Fetching live onlines for panel ${p.id}`);
        const res = await axios.post(`${apiBaseUrl}/panel/api/inbounds/onlines`, {}, {
          headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined },
          timeout: 5000,
        });

        if (res.data && res.data.success && Array.isArray(res.data.obj)) {
          this.logger.debug(`Panel ${p.id} returned ${res.data.obj.length} online clients.`);
          res.data.obj.forEach((email: string) => {
             if (email) onlineEmails.add(email.trim().toLowerCase());
          });
          return;
        } else {
          this.logger.debug(`Panel ${p.id} onlines API response was not successful or obj is missing:`, res.data);
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          this.logger.debug(`Panel ${p.id} doesn't support /onlines API, falling back to /inbounds/list`);
          try {
            const apiBaseUrl = p.apiBaseUrl || p.url.replace(/\/$/, '');
            const listRes = await axios.get(`${apiBaseUrl}/panel/api/inbounds/list`, {
              headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined },
              timeout: 8000,
            });
            if (listRes.data && listRes.data.success && Array.isArray(listRes.data.obj)) {
              const now = Date.now();
              let count = 0;
              listRes.data.obj.forEach((inb: any) => {
                if (Array.isArray(inb.clientStats)) {
                  inb.clientStats.forEach((cs: any) => {
                    if (cs.email && cs.lastOnline && (now - cs.lastOnline < 120000)) {
                      onlineEmails.add(cs.email.trim().toLowerCase());
                      count++;
                    }
                  });
                }
              });
              this.logger.debug(`Panel ${p.id} fallback returned ${count} online clients.`);
            }
          } catch (fallbackErr: any) {
            this.logger.warn(`Fallback inbounds/list failed for panel ${p.id}: ${fallbackErr.message}`);
          }
        } else {
          this.logger.warn(`Failed to fetch live onlines for panel ${p.id}: ${err.message}`);
        }
      }
    }));

    return Array.from(onlineEmails);
  }
}

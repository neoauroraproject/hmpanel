import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Optional proxy for reaching 3x-ui panels.
 *
 * mode "fallback": every panel call goes direct first; when the network path fails
 * (timeout, refused, unreachable, reset, DNS) the same call is retried once through the
 * proxy. A host that only works through the proxy keeps using it for 10 minutes, so
 * later calls do not wait for the direct timeout again.
 * mode "always": panel calls always use the proxy.
 *
 * Only requests whose host is a registered panel are touched; Telegram, license and
 * other outgoing calls are left alone. HTTP errors from the panel itself (401, 404 …)
 * are real answers and are never retried.
 */
export type PanelProxyConfig = {
  enabled: boolean;
  mode: 'fallback' | 'always';
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
};

export const PANEL_PROXY_SETTING = 'panel_connection_proxy';
const NETWORK_ERRORS = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
]);
const STICKY_MS = 10 * 60 * 1000;

type ProxiedConfig = InternalAxiosRequestConfig & { __panelProxy?: 'used' | 'retried' };

export function emptyPanelProxyConfig(): PanelProxyConfig {
  return { enabled: false, mode: 'fallback', type: 'socks5', host: '', port: 1080 };
}

export function normalizePanelProxyConfig(raw: unknown): PanelProxyConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = String(r.type || '').toLowerCase() === 'http' ? 'http' : 'socks5';
  const port = Math.floor(Number(r.port) || 0);
  return {
    enabled: r.enabled === true,
    mode: r.mode === 'always' ? 'always' : 'fallback',
    type,
    host: String(r.host || '').trim(),
    port: port > 0 && port < 65536 ? port : type === 'http' ? 8080 : 1080,
    username: r.username ? String(r.username) : undefined,
    password: r.password ? String(r.password) : undefined,
  };
}

export function isNetworkFailure(err: unknown): boolean {
  const e = err as AxiosError & { cause?: { code?: string } };
  if (e?.response) return false; // the panel answered: not a path problem
  const code = String(e?.code || e?.cause?.code || '');
  if (NETWORK_ERRORS.has(code)) return true;
  return /timeout|socket hang up|network error/i.test(String(e?.message || ''));
}

@Injectable()
export class PanelConnectionProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PanelConnectionProxyService.name);
  private cfg: PanelProxyConfig = emptyPanelProxyConfig();
  private cfgLoadedAt = 0;
  private panelHosts = new Set<string>();
  private hostsLoadedAt = 0;
  private stickyUntil = new Map<string, number>();
  private agents: { http: unknown; https: unknown } | null = null;
  private interceptors: { req: number; res: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    const req = axios.interceptors.request.use(async (config) => this.beforeRequest(config as ProxiedConfig));
    const res = axios.interceptors.response.use(
      (response) => response,
      async (error) => this.onError(error),
    );
    this.interceptors = { req, res };
  }

  onModuleDestroy() {
    if (!this.interceptors) return;
    axios.interceptors.request.eject(this.interceptors.req);
    axios.interceptors.response.eject(this.interceptors.res);
  }

  /** Called after the settings page saves, so changes apply without a restart. */
  invalidate() {
    this.cfgLoadedAt = 0;
    this.hostsLoadedAt = 0;
    this.agents = null;
    this.stickyUntil.clear();
  }

  async getConfig(): Promise<PanelProxyConfig> {
    if (Date.now() - this.cfgLoadedAt > 30_000) {
      this.cfg = normalizePanelProxyConfig(await this.settings.getSetting(PANEL_PROXY_SETTING, null));
      this.cfgLoadedAt = Date.now();
      this.agents = null;
    }
    return this.cfg;
  }

  private async isPanelHost(hostname: string): Promise<boolean> {
    if (Date.now() - this.hostsLoadedAt > 60_000) {
      const rows = await this.prisma.panel.findMany({ select: { url: true } });
      const next = new Set<string>();
      for (const r of rows) {
        try {
          next.add(new URL(r.url).hostname.toLowerCase());
        } catch {
          /* malformed panel URL: skip */
        }
      }
      this.panelHosts = next;
      this.hostsLoadedAt = Date.now();
    }
    return this.panelHosts.has(hostname.toLowerCase());
  }

  private hostOf(config: InternalAxiosRequestConfig): string | null {
    try {
      return new URL(String(config.url || ''), config.baseURL || undefined).hostname;
    } catch {
      return null;
    }
  }

  buildAgents(cfg: PanelProxyConfig) {
    const auth =
      cfg.username || cfg.password
        ? `${encodeURIComponent(cfg.username || '')}:${encodeURIComponent(cfg.password || '')}@`
        : '';
    // Panels often use self-signed certificates; direct calls skip the check too.
    const tlsOpts = { rejectUnauthorized: false, keepAlive: false, timeout: 15_000 } as any;
    if (cfg.type === 'http') {
      const agent = new HttpsProxyAgent(`http://${auth}${cfg.host}:${cfg.port}`, tlsOpts);
      return { http: agent, https: agent };
    }
    // socks5h: DNS through the proxy, for panels whose name only resolves "outside".
    const agent = new SocksProxyAgent(`socks5h://${auth}${cfg.host}:${cfg.port}`, tlsOpts);
    return { http: agent, https: agent };
  }

  private applyProxy(config: ProxiedConfig, cfg: PanelProxyConfig) {
    if (!this.agents) this.agents = this.buildAgents(cfg);
    config.httpAgent = this.agents.http as any;
    config.httpsAgent = this.agents.https as any;
    config.proxy = false;
  }

  private async beforeRequest(config: ProxiedConfig): Promise<ProxiedConfig> {
    try {
      const cfg = await this.getConfig();
      if (!cfg.enabled || !cfg.host || config.__panelProxy) return config;
      const host = this.hostOf(config);
      if (!host || !(await this.isPanelHost(host))) return config;
      const sticky = (this.stickyUntil.get(host) || 0) > Date.now();
      if (cfg.mode === 'always' || sticky) {
        this.applyProxy(config, cfg);
        config.__panelProxy = 'used';
      }
    } catch {
      /* never break a panel call because of the proxy layer */
    }
    return config;
  }

  private async onError(error: AxiosError): Promise<unknown> {
    const config = error?.config as ProxiedConfig | undefined;
    if (!config || config.__panelProxy) throw error;
    const cfg = await this.getConfig().catch(() => null);
    if (!cfg?.enabled || !cfg.host || cfg.mode !== 'fallback') throw error;
    if (!isNetworkFailure(error)) throw error;
    const host = this.hostOf(config);
    if (!host || !(await this.isPanelHost(host).catch(() => false))) throw error;

    config.__panelProxy = 'retried';
    this.applyProxy(config, cfg);
    try {
      const res = await axios.request(config);
      if (!((this.stickyUntil.get(host) || 0) > Date.now())) {
        this.logger.warn(`Panel ${host}: direct connection failed (${error.code || error.message}); working through the proxy.`);
      }
      this.stickyUntil.set(host, Date.now() + STICKY_MS);
      return res;
    } catch (proxyErr) {
      this.logger.warn(`Panel ${host}: direct and proxy both failed (${(proxyErr as Error)?.message || proxyErr}).`);
      throw error;
    }
  }

  /** Settings page "test": reach one panel URL directly and through the proxy. */
  async probe(url: string, override?: Partial<PanelProxyConfig>) {
    const cfg = normalizePanelProxyConfig({ ...(await this.getConfig()), ...(override || {}), enabled: true });
    const attempt = async (viaProxy: boolean) => {
      const started = Date.now();
      try {
        const agents = viaProxy ? this.buildAgents(cfg) : null;
        const res = await axios.get(url, {
          timeout: 10_000,
          validateStatus: () => true,
          maxRedirects: 0,
          proxy: false,
          ...(agents
            ? { httpAgent: agents.http as any, httpsAgent: agents.https as any }
            : { httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }),
          // Skip our own interceptor so the probe reports the real path.
          __panelProxy: 'used',
        } as any);
        return { ok: true, ms: Date.now() - started, status: res.status };
      } catch (err: any) {
        return { ok: false, ms: Date.now() - started, error: String(err?.code || err?.message || err).slice(0, 200) };
      }
    };
    const [direct, viaProxy] = await Promise.all([attempt(false), cfg.host ? attempt(true) : Promise.resolve({ ok: false, ms: 0, error: 'No proxy host' })]);
    return { direct, viaProxy };
  }
}

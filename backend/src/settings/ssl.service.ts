import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Observable, ReplaySubject } from 'rxjs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as dns from 'dns';
import * as net from 'net';
import * as https from 'https';
import { TLSSocket } from 'tls';
import axios from 'axios';
import { HmctlClient, HmctlEvent } from './hmctl.client';

const execAsync = promisify(exec);

type SslStreamEvent = { data: unknown };
const SSL_OP_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const STREAM_REPLAY = 200;
const STREAM_IDLE_TTL_MS = 30 * 60_000;
const STREAM_DONE_TTL_MS = 10 * 60_000;

@Injectable()
export class SslService {
  private readonly logger = new Logger(SslService.name);
  private readonly certPath = '/etc/nginx/ssl/fullchain.pem';
  private readonly nginxConfPath = '/app/nginx_host/nginx.conf.template';
  private readonly acmeShPath = '/app/acme.sh/acme.sh';

  private isExecuting = false;
  private readonly opStreams = new Map<
    string,
    { subject: ReplaySubject<SslStreamEvent>; expiresAt: number }
  >();
  /** Latest operation's stream, for clients that do not send an opId. */
  private legacyStream: ReplaySubject<SslStreamEvent> | null = null;

  private getLiveEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    try {
      const envPath = '/app/.env';
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.substring(0, idx).trim();
            let val = trimmed.substring(idx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.substring(1, val.length - 1);
            }
            env[key] = val;
          }
        }
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('Failed to read live .env file: ' + msg);
    }
    return env;
  }

  private get domain() {
    const liveEnv = this.getLiveEnv();
    return (
      liveEnv.DOMAIN ||
      liveEnv.PANEL_DOMAIN ||
      process.env.DOMAIN ||
      process.env.PANEL_DOMAIN ||
      'localhost'
    );
  }

  private getPeerCertificate(hostname: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          port: 443,
          method: 'HEAD',
          rejectUnauthorized: false,
          timeout: 3000,
        },
        (res) => {
          const socket = res.socket as TLSSocket | undefined;
          const cert = socket ? socket.getPeerCertificate() : null;
          if (cert && Object.keys(cert).length > 0) {
            resolve(cert);
          } else {
            reject(new Error('No certificate presented'));
          }
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    });
  }

  private lastSuccessfulState: Record<string, unknown> | null = null;
  private readonly CACHE_FILE = path.join('/app/uploads', '.ssl_cache.json');

  constructor(private hmctl: HmctlClient) {
    this.loadCache();
  }

  private loadCache() {
    try {
      if (fs.existsSync(this.CACHE_FILE)) {
        const data = fs.readFileSync(this.CACHE_FILE, 'utf8');
        this.lastSuccessfulState = JSON.parse(data) as Record<string, unknown>;
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('Could not load SSL cache from disk: ' + msg);
    }
  }

  private saveCache() {
    try {
      if (!fs.existsSync('/app/uploads')) {
        fs.mkdirSync('/app/uploads', { recursive: true });
      }
      fs.writeFileSync(
        this.CACHE_FILE,
        JSON.stringify(this.lastSuccessfulState),
        'utf8',
      );
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('Could not save SSL cache to disk: ' + msg);
    }
  }

  async getStatus() {
    const liveEnv = this.getLiveEnv();
    const providerEnv = liveEnv.SSL_PROVIDER || 'none';
    const domain = this.domain;

    const checkPortNginxContainer = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(800);
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(port, 'hmpanel-nginx');
      });
    };

    const localCertPath = '/etc/nginx/ssl/fullchain.pem';
    const localKeyPath = '/etc/nginx/ssl/privkey.pem';
    let certExists =
      fs.existsSync(localCertPath) && fs.existsSync(localKeyPath);

    if (certExists) {
      try {
        await execAsync(`openssl x509 -checkend 0 -noout -in ${localCertPath}`);
      } catch {
        certExists = false;
      }
    }

    // Parallel checks
    const dnsPromise = (async () => {
      try {
        if (domain !== 'localhost' && !/^[0-9.]+$/.test(domain)) {
          const ips = await dns.promises.resolve4(domain);
          if (ips && ips.length > 0) return { status: 'PASS', ip: ips[0] };
        }
        return { status: 'N/A', ip: '127.0.0.1' };
      } catch {
        return { status: 'FAIL', ip: 'N/A' };
      }
    })();

    const ipifyPromise = (async () => {
      try {
        const ipRes = await axios.get<string>('https://api.ipify.org', {
          timeout: 1200,
        });
        return ipRes.data.trim();
      } catch {
        return 'Unknown';
      }
    })();

    const port80Promise = checkPortNginxContainer(80);
    const port443Promise = checkPortNginxContainer(443);

    const httpHealthPromise = (async () => {
      try {
        const res = await axios.get<unknown>(
          'http://hmpanel-nginx/api/health',
          { timeout: 1200 },
        );
        return res.status === 200 ? 'PASS' : 'FAIL';
      } catch {
        return 'FAIL';
      }
    })();

    const httpsHealthPromise = (async () => {
      try {
        const agent = new https.Agent({ rejectUnauthorized: false });
        const res = await axios.get<unknown>(
          'https://hmpanel-nginx/api/health',
          { httpsAgent: agent, timeout: 1200 },
        );
        return res.status === 200 ? 'PASS' : 'FAIL';
      } catch {
        return 'FAIL';
      }
    })();

    const backendPromise = (async () => {
      try {
        const res = await axios.get<unknown>('http://127.0.0.1:4000/health', {
          timeout: 1000,
        });
        return res.status === 200 ? 'PASS' : 'FAIL';
      } catch {
        return 'FAIL';
      }
    })();

    const frontendPromise = (async () => {
      try {
        const res = await axios.get<unknown>('http://127.0.0.1:3000', {
          timeout: 1000,
        });
        return res.status === 200 ? 'PASS' : 'FAIL';
      } catch {
        return 'FAIL';
      }
    })();

    const redirectPromise = (async () => {
      if (certExists) {
        try {
          const res = await axios.get<unknown>('http://hmpanel-nginx', {
            maxRedirects: 0,
            validateStatus: (status: number) => status >= 300 && status < 400,
            timeout: 1000,
          });
          const loc = (res.headers.location as string) || '';
          return loc.startsWith('https://') ? 'PASS' : 'FAIL';
        } catch {
          return 'FAIL';
        }
      }
      return 'N/A';
    })();

    const [
      dnsResult,
      expectedServerIp,
      tcp80Bool,
      tcp443Bool,
      httpHealth,
      httpsHealth,
      backend,
      frontend,
      redirect,
    ] = await Promise.all([
      dnsPromise,
      ipifyPromise,
      port80Promise,
      port443Promise,
      httpHealthPromise,
      httpsHealthPromise,
      backendPromise,
      frontendPromise,
      redirectPromise,
    ]);

    const dnsStatus = dnsResult.status;
    const resolvedIp = dnsResult.ip;
    const tcp80 = tcp80Bool ? 'PASS' : 'FAIL';
    const tcp443 = tcp443Bool ? 'PASS' : 'FAIL';
    const isNginxRunning = tcp80Bool || tcp443Bool;
    const isHttpsInNginx = tcp443Bool;
    const nginxListening443 = tcp443;
    const nginxConfigTest = isNginxRunning ? 'PASS' : 'FAIL';

    // Cert validation
    const serverName = 'N/A';
    let certificateValid = 'FAIL';
    let expiration: string | null = null;
    let daysRemaining: number | null = null;
    let issuer: string | null = null;

    if (certExists) {
      try {
        const { stdout: enddateOut } = await execAsync(
          `openssl x509 -enddate -noout -in ${localCertPath}`,
        );
        const { stdout: issuerOut } = await execAsync(
          `openssl x509 -issuer -noout -in ${localCertPath}`,
        );

        const dateStr = enddateOut.replace('notAfter=', '').trim();
        const expDate = new Date(dateStr);
        expiration = expDate.toISOString();

        const now = new Date();
        const diffTime = Math.abs(expDate.getTime() - now.getTime());
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (expDate.getTime() < now.getTime()) {
          daysRemaining = -daysRemaining;
          certificateValid = 'FAIL';
        } else {
          certificateValid = 'PASS';
        }
        issuer = issuerOut.replace('issuer=', '').trim();
      } catch (certError: unknown) {
        const msg =
          certError instanceof Error ? certError.message : String(certError);
        this.logger.error('Failed to parse cert: ' + msg);
      }
    }

    // Peer Cert loaded
    let certificateLoaded = 'FAIL';
    let tlsHandshake = 'FAIL';
    if (isNginxRunning && isHttpsInNginx) {
      try {
        await this.getPeerCertificate('hmpanel-nginx');
        certificateLoaded = 'PASS';
        tlsHandshake = 'PASS';
      } catch {
        // ignore
      }
    }

    // Consistency check: Only corrupted if Nginx is serving HTTPS but no cert exists.
    // Having a cert exist but running in HTTP mode is a valid disabled/fallback state.
    const isCorrupted = !certExists && isHttpsInNginx;
    const isIpOrLocalhost = /^[0-9.]+$/.test(domain) || domain === 'localhost';

    const diagnostics = {
      lastCheckTime: new Date().toISOString(),
      lastProbeError: null,
      domainProbed: domain,
      tlsHandshakeStatus: tlsHandshake === 'PASS' ? 'Success' : 'Failed',
      certificateExpiration: expiration,
      certificateIssuer: issuer,
      dnsResolution: dnsStatus,
      resolvedIp,
      expectedServerIp,
      httpVirtualHost: tcp80Bool ? 'PASS' : 'FAIL',
      httpsVirtualHost: isHttpsInNginx ? 'PASS' : 'FAIL',
      serverName,
      tcp80,
      tcp443,
      certificateExists: certExists ? 'PASS' : 'FAIL',
      certificateValid,
      certificateLoaded,
      nginxConfig: nginxConfigTest,
      nginxListening443,
      tlsHandshake,
      httpHealth,
      httpsHealth,
      backend,
      frontend,
      redirect,
    };

    // Determine mode
    let mode = '';
    if (isCorrupted) {
      mode = 'Configuration State Corrupted';
    } else if (isIpOrLocalhost && isHttpsInNginx) {
      mode = 'IP HTTPS';
    } else if (isIpOrLocalhost && !isHttpsInNginx) {
      mode = 'IP HTTP';
    } else if (!isIpOrLocalhost && isHttpsInNginx) {
      mode = 'Domain HTTPS';
    } else {
      mode = 'Domain HTTP';
    }

    let warning: string | null = null;
    if (isCorrupted) {
      warning =
        'Configuration State Corrupted: SSL state is inconsistent. Nginx, .env, or certificate files do not match.';
    }

    const result = {
      mode,
      domain,
      isHttpsEnabled: isHttpsInNginx,
      provider: providerEnv,
      certPath: certExists ? '/etc/nginx/ssl/fullchain.pem' : 'Not Found',
      certificate: {
        exists: certExists,
        ...(certExists && expiration
          ? { expiration, daysRemaining, issuer }
          : {}),
      },
      warning,
      diagnostics,
      isCorrupted,
    };

    if (certExists) {
      this.lastSuccessfulState = result;
      this.saveCache();
    }

    return result;
  }

  async renew(opId?: string) {
    // The button is an explicit request, so it forces; the nightly cron only
    // renews certificates that are due.
    const data = await this.runStreamed('renew', ['force'], opId);
    return {
      success: true,
      log: typeof data.log === 'string' ? data.log : 'Success',
    };
  }

  async switchMode(enableHttps: boolean, opId?: string) {
    await this.runStreamed(enableHttps ? 'enable' : 'disable', [], opId);
    return { success: true, https: enableHttps };
  }

  async issue(
    domain: string,
    email: string,
    selfSigned: boolean = false,
    opId?: string,
  ) {
    const value = this.assertValidDomain(domain);
    if (selfSigned) {
      return this.runStreamed('selfsigned', [value], opId);
    }
    return this.runStreamed('issue', [value, this.normalizeEmail(email)], opId);
  }

  async changeDomain(domain: string, email: string, opId?: string) {
    const value = this.assertValidDomain(domain);
    return this.runStreamed(
      'change-domain',
      [value, this.normalizeEmail(email)],
      opId,
    );
  }

  async repair(opId?: string) {
    return this.runStreamed('repair', [], opId);
  }

  /**
   * Progress stream for one operation. The UI subscribes with the same opId it
   * then POSTs, so it can never receive a previous operation's events.
   */
  getStream(opId?: string): Observable<SslStreamEvent> {
    if (opId && SSL_OP_ID_RE.test(opId)) {
      return this.streamFor(opId).asObservable();
    }
    if (!this.legacyStream) {
      this.legacyStream = new ReplaySubject<SslStreamEvent>(STREAM_REPLAY);
    }
    return this.legacyStream.asObservable();
  }

  private streamFor(opId: string): ReplaySubject<SslStreamEvent> {
    const now = Date.now();
    for (const [key, entry] of this.opStreams) {
      if (entry.expiresAt <= now) this.opStreams.delete(key);
    }
    let entry = this.opStreams.get(opId);
    if (!entry) {
      entry = {
        subject: new ReplaySubject<SslStreamEvent>(STREAM_REPLAY),
        expiresAt: now + STREAM_IDLE_TTL_MS,
      };
      this.opStreams.set(opId, entry);
    }
    return entry.subject;
  }

  private async runStreamed(
    action: string,
    args: string[],
    clientOpId: string | undefined,
  ): Promise<Record<string, unknown>> {
    if (this.isExecuting) {
      throw new HttpException(
        'SSL operation already in progress.',
        HttpStatus.CONFLICT,
      );
    }
    this.isExecuting = true;
    const hostOpId = Math.random().toString(16).substring(2, 8);
    const streamKey =
      clientOpId && SSL_OP_ID_RE.test(clientOpId)
        ? clientOpId
        : `srv-${hostOpId}`;
    const stream = this.streamFor(streamKey);
    this.legacyStream = stream;
    this.logger.log(`[SSL][${hostOpId}] Triggering ${action}`);

    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        this.hmctl.executeStream('ssl', action, args, hostOpId).subscribe({
          next: (event: HmctlEvent) => {
            if (event.type === 'progress') {
              stream.next({
                data: { type: 'progress', message: event.message },
              });
            } else if (event.type === 'complete') {
              stream.next({ data: { type: 'complete', data: event.data } });
              resolve((event.data ?? {}) as Record<string, unknown>);
            } else {
              stream.next({ data: { type: 'error', error: event.error } });
              const message =
                event.error?.reason ||
                event.error?.message ||
                'SSL operation failed';
              this.logger.warn(`[SSL][${hostOpId}] ${action} failed: ${message}`);
              reject(
                new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR),
              );
            }
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            stream.next({ data: { type: 'error', error: { message } } });
            reject(new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR));
          },
        });
      });
    } finally {
      this.isExecuting = false;
      // Completed streams still replay to a reconnecting browser (nginx is
      // recreated mid-operation), then expire.
      stream.complete();
      const entry = this.opStreams.get(streamKey);
      if (entry) entry.expiresAt = Date.now() + STREAM_DONE_TTL_MS;
    }
  }

  private assertValidDomain(domain: string): string {
    const value = (domain || '').trim().toLowerCase();
    const isFqdn =
      /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(
        value,
      );
    if (!isFqdn) {
      throw new HttpException(
        `"${domain}" is not a valid domain name. Use a fully qualified domain such as panel.example.com.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return value;
  }

  /** Empty is allowed: the CLI then registers admin@<domain>. */
  private normalizeEmail(email: string | undefined): string {
    const value = (email || '').trim();
    if (!value) return '';
    if (!/^[^\s@"'`\\]+@[^\s@"'`\\]+\.[^\s@"'`\\]+$/.test(value)) {
      throw new HttpException(
        `"${value}" is not a valid email address.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return value;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('Running daily ACME renewal check via host...');
    try {
      const result = (await this.hmctl.execute('ssl', 'renew')) as {
        log?: string;
      };
      this.logger.log('ACME cron result: ' + JSON.stringify(result));
    } catch (e: any) {
      this.logger.error('ACME cron failed', e);
    }
  }
}

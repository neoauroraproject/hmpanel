import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReplaySubject } from 'rxjs';
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

@Injectable()
export class SslService {
  private readonly logger = new Logger(SslService.name);
  private readonly certPath = '/etc/nginx/ssl/fullchain.pem';
  private readonly nginxConfPath = '/app/nginx_host/nginx.conf.template';
  private readonly acmeShPath = '/app/acme.sh/acme.sh';

  private isExecuting = false;

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
    const sslEnabled = liveEnv.SSL_ENABLED === 'true';
    const protocol = liveEnv.PANEL_PROTOCOL || 'http';
    const providerEnv = liveEnv.SSL_PROVIDER || 'none';
    const domain = this.domain;

    let isNginxRunning = false;
    let nginxConfOut = '';
    try {
      const { stdout } = await execAsync(
        'docker inspect -f "{{.State.Status}}" hmpanel-nginx 2>/dev/null || echo "missing"',
      );
      isNginxRunning = stdout.trim() === 'running';
      if (isNginxRunning) {
        const { stdout: conf } = await execAsync(
          'docker exec hmpanel-nginx cat /etc/nginx/nginx.conf 2>/dev/null || true',
        );
        nginxConfOut = conf;
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('Failed to check Nginx status: ' + msg);
    }

    const isHttpsInNginx =
      nginxConfOut.includes('listen 443 ssl') ||
      nginxConfOut.includes('ssl_certificate');

    const localCertPath = '/etc/nginx/ssl/fullchain.pem';
    const localKeyPath = '/etc/nginx/ssl/privkey.pem';
    const certExists =
      fs.existsSync(localCertPath) && fs.existsSync(localKeyPath);

    // DNS Resolution
    let dnsStatus = 'FAIL';
    let resolvedIp = 'N/A';
    try {
      if (domain !== 'localhost' && !/^[0-9.]+$/.test(domain)) {
        const ips = await dns.promises.resolve4(domain);
        if (ips && ips.length > 0) {
          dnsStatus = 'PASS';
          resolvedIp = ips[0];
        }
      } else {
        dnsStatus = 'N/A';
        resolvedIp = '127.0.0.1';
      }
    } catch {
      dnsStatus = 'FAIL';
    }

    // Expected Server IP
    let expectedServerIp = 'N/A';
    try {
      const ipRes = await axios.get<string>('https://api.ipify.org', {
        timeout: 2000,
      });
      expectedServerIp = ipRes.data.trim();
    } catch {
      expectedServerIp = 'Unknown';
    }

    // Nginx Listening 443
    let nginxListening443 = 'FAIL';
    try {
      if (isNginxRunning) {
        const { stdout } = await execAsync(
          'docker exec hmpanel-nginx netstat -tuln 2>/dev/null || docker exec hmpanel-nginx ss -tuln 2>/dev/null || true',
        );
        nginxListening443 = stdout.includes(':443') ? 'PASS' : 'FAIL';
      }
    } catch {
      // ignore
    }

    // Nginx Config Test
    let nginxConfigTest = 'FAIL';
    try {
      if (isNginxRunning) {
        await execAsync('docker exec hmpanel-nginx nginx -t');
        nginxConfigTest = 'PASS';
      }
    } catch {
      // ignore
    }

    // TCP checks
    const checkPort = (port: number): Promise<'PASS' | 'FAIL'> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1500);
        socket.on('connect', () => {
          socket.destroy();
          resolve('PASS');
        });
        socket.on('error', () => {
          socket.destroy();
          resolve('FAIL');
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve('FAIL');
        });
        socket.connect(port, isNginxRunning ? 'hmpanel-nginx' : '127.0.0.1');
      });
    };
    const tcp80 = await checkPort(80);
    const tcp443 = await checkPort(443);

    // Cert validation
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

    // HTTP/HTTPS Health checks
    let httpHealth = 'FAIL';
    let httpsHealth = 'FAIL';
    try {
      const httpRes = await axios.get<unknown>(
        'http://hmpanel-nginx/api/health',
        { timeout: 2000 },
      );
      if (httpRes.status === 200) httpHealth = 'PASS';
    } catch {
      // ignore
    }

    try {
      const agent = new https.Agent({ rejectUnauthorized: false });
      const httpsRes = await axios.get<unknown>(
        'https://hmpanel-nginx/api/health',
        { httpsAgent: agent, timeout: 2000 },
      );
      if (httpsRes.status === 200) httpsHealth = 'PASS';
    } catch {
      // ignore
    }

    // Backend / Frontend
    let backend = 'FAIL';
    let frontend = 'FAIL';
    try {
      const backendRes = await axios.get<unknown>(
        'http://localhost:4000/health',
        { timeout: 1500 },
      );
      if (backendRes.status === 200) backend = 'PASS';
    } catch {
      // ignore
    }

    try {
      const frontendRes = await axios.get<unknown>('http://localhost:3000', {
        timeout: 1500,
      });
      if (frontendRes.status === 200) frontend = 'PASS';
    } catch {
      // ignore
    }

    // HTTP Redirect
    let redirect = 'FAIL';
    if (sslEnabled) {
      try {
        const res = await axios.get<unknown>('http://hmpanel-nginx', {
          maxRedirects: 0,
          validateStatus: (status: number) => status >= 300 && status < 400,
          timeout: 1500,
        });
        const loc = (res.headers.location as string) || '';
        redirect = loc.startsWith('https://') ? 'PASS' : 'FAIL';
      } catch {
        redirect = 'FAIL';
      }
    } else {
      redirect = 'N/A';
    }

    // server_name check
    let serverName = 'FAIL';
    const serverNameLine = nginxConfOut
      .split('\n')
      .find((line) => line.includes('server_name'));
    if (serverNameLine) {
      if (serverNameLine.includes(domain) || serverNameLine.includes('_')) {
        serverName = 'PASS';
      }
    }

    // Consistency check
    let isCorrupted = false;
    const isIpOrLocalhost = /^[0-9.]+$/.test(domain) || domain === 'localhost';

    if (sslEnabled) {
      if (isIpOrLocalhost) isCorrupted = true;
      if (protocol !== 'https') isCorrupted = true;
      if (providerEnv === 'none' || !providerEnv) isCorrupted = true;
      if (!certExists) isCorrupted = true;
      if (!isHttpsInNginx) isCorrupted = true;
    } else {
      if (protocol === 'https') isCorrupted = true;
      if (providerEnv !== 'none' && providerEnv !== '') isCorrupted = true;
      if (isHttpsInNginx) isCorrupted = true;
    }

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
      httpVirtualHost:
        isNginxRunning && nginxConfOut.includes('listen 80') ? 'PASS' : 'FAIL',
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

  async renew() {
    if (this.isExecuting) {
      throw new HttpException(
        'SSL operation already in progress.',
        HttpStatus.CONFLICT,
      );
    }
    this.isExecuting = true;
    const opId = Math.random().toString(16).substring(2, 8);
    this.logger.log(`[SSL][${opId}] Triggering host renewal...`);
    try {
      const result = (await this.hmctl.execute('ssl', 'renew', [], opId)) as {
        log?: string;
      };
      this.logger.log(
        `[SSL][${opId}] Renewal result: ${JSON.stringify(result)}`,
      );
      return { success: true, log: result.log || 'Success' };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[SSL][${opId}] Renewal failed: ` + errMsg, e);
      throw new HttpException(
        'Renewal failed: ' + errMsg,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      this.isExecuting = false;
    }
  }

  async switchMode(enableHttps: boolean) {
    if (this.isExecuting) {
      throw new HttpException(
        'SSL operation already in progress.',
        HttpStatus.CONFLICT,
      );
    }
    this.isExecuting = true;
    const opId = Math.random().toString(16).substring(2, 8);
    const cmdAction = enableHttps ? 'enable' : 'disable';
    this.logger.log(`[SSL][${opId}] Triggering switchMode: ${cmdAction}`);

    this.stream$ = new ReplaySubject<{ data: unknown }>(100);

    return new Promise((resolve, reject) => {
      this.hmctl.executeStream('ssl', cmdAction, [], opId).subscribe({
        next: (event: HmctlEvent) => {
          if (event.type === 'progress') {
            this.stream$?.next({
              data: { type: 'progress', message: event.message },
            });
          } else if (event.type === 'complete') {
            this.stream$?.next({
              data: { type: 'complete', data: event.data },
            });
            resolve({ success: true, https: enableHttps });
          } else if (event.type === 'error') {
            this.stream$?.next({ data: { type: 'error', error: event.error } });
            reject(
              new HttpException(
                event.error?.message || 'Error',
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
            );
          }
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.stream$?.next({ data: { type: 'error', error: { message } } });
          reject(new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR));
        },
      });
    }).finally(() => {
      this.isExecuting = false;
    });
  }

  private stream$: ReplaySubject<{ data: unknown }> | null = null;

  getStream() {
    if (!this.stream$) {
      this.stream$ = new ReplaySubject<{ data: unknown }>(100);
    }
    return this.stream$.asObservable();
  }

  async issue(domain: string, email: string, selfSigned: boolean = false) {
    if (this.isExecuting) {
      throw new HttpException(
        'SSL operation already in progress.',
        HttpStatus.CONFLICT,
      );
    }
    this.isExecuting = true;
    const opId = Math.random().toString(16).substring(2, 8);
    const action = selfSigned ? 'selfsigned' : 'issue';
    const args = selfSigned ? [domain] : [domain, email];
    this.logger.log(
      `[SSL][${opId}] Triggering issue: ${action} for domain: ${domain}`,
    );

    this.stream$ = new ReplaySubject<{ data: unknown }>(100);

    return new Promise((resolve, reject) => {
      this.hmctl.executeStream('ssl', action, args, opId).subscribe({
        next: (event: HmctlEvent) => {
          if (event.type === 'progress') {
            this.stream$?.next({
              data: { type: 'progress', message: event.message },
            });
          } else if (event.type === 'complete') {
            this.stream$?.next({
              data: { type: 'complete', data: event.data },
            });
            resolve(event.data);
          } else if (event.type === 'error') {
            this.stream$?.next({ data: { type: 'error', error: event.error } });
            reject(
              new HttpException(
                event.error?.message || 'Error',
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
            );
          }
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.stream$?.next({ data: { type: 'error', error: { message } } });
          reject(new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR));
        },
      });
    }).finally(() => {
      this.isExecuting = false;
    });
  }

  async changeDomain(domain: string, email: string) {
    if (this.isExecuting) {
      throw new HttpException(
        'SSL operation already in progress.',
        HttpStatus.CONFLICT,
      );
    }
    this.isExecuting = true;
    const opId = Math.random().toString(16).substring(2, 8);
    this.logger.log(`[SSL][${opId}] Triggering changeDomain: ${domain}`);

    this.stream$ = new ReplaySubject<{ data: unknown }>(100);

    return new Promise((resolve, reject) => {
      this.hmctl
        .executeStream('ssl', 'change-domain', [domain, email], opId)
        .subscribe({
          next: (event: HmctlEvent) => {
            if (event.type === 'progress') {
              this.stream$?.next({
                data: { type: 'progress', message: event.message },
              });
            } else if (event.type === 'complete') {
              this.stream$?.next({
                data: { type: 'complete', data: event.data },
              });
              resolve(event.data);
            } else if (event.type === 'error') {
              this.stream$?.next({
                data: { type: 'error', error: event.error },
              });
              reject(
                new HttpException(
                  event.error?.message || 'Error',
                  HttpStatus.INTERNAL_SERVER_ERROR,
                ),
              );
            }
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.stream$?.next({ data: { type: 'error', error: { message } } });
            reject(
              new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR),
            );
          },
        });
    }).finally(() => {
      this.isExecuting = false;
    });
  }

  async repair() {
    if (this.isExecuting) {
      throw new HttpException(
        'SSL operation already in progress.',
        HttpStatus.CONFLICT,
      );
    }
    this.isExecuting = true;
    const opId = Math.random().toString(16).substring(2, 8);
    this.logger.log(`[SSL][${opId}] Triggering repair`);

    this.stream$ = new ReplaySubject<{ data: unknown }>(100);

    return new Promise((resolve, reject) => {
      this.hmctl.executeStream('ssl', 'repair', [], opId).subscribe({
        next: (event: HmctlEvent) => {
          if (event.type === 'progress') {
            this.stream$?.next({
              data: { type: 'progress', message: event.message },
            });
          } else if (event.type === 'complete') {
            this.stream$?.next({
              data: { type: 'complete', data: event.data },
            });
            resolve(event.data);
          } else if (event.type === 'error') {
            this.stream$?.next({ data: { type: 'error', error: event.error } });
            reject(
              new HttpException(
                event.error?.message || 'Error',
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
            );
          }
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.stream$?.next({ data: { type: 'error', error: { message } } });
          reject(new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR));
        },
      });
    }).finally(() => {
      this.isExecuting = false;
    });
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

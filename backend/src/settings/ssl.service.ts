import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class SslService {
  private readonly logger = new Logger(SslService.name);
  private readonly certPath = '/etc/nginx/ssl/fullchain.pem';
  private readonly nginxConfPath = '/app/nginx_host/nginx.conf.template';
  private readonly acmeShPath = '/app/acme.sh/acme.sh';

  private get domain() {
    return process.env.DOMAIN || process.env.PANEL_DOMAIN || 'localhost';
  }

  private getPeerCertificate(hostname: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const req = https.request({
        hostname,
        port: 443,
        method: 'HEAD',
        rejectUnauthorized: false,
        timeout: 3000
      }, (res: any) => {
        const cert = res.socket.getPeerCertificate();
        if (cert && Object.keys(cert).length > 0) {
          resolve(cert);
        } else {
          reject(new Error('No certificate presented'));
        }
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  private lastSuccessfulState: any = null;
  private readonly CACHE_FILE = path.join('/app/uploads', '.ssl_cache.json');
  private lastDiagnostics: any = {
    lastCheckTime: null,
    lastProbeError: null,
    domainProbed: null,
    tlsHandshakeStatus: 'Pending',
    certificateExpiration: null,
    certificateIssuer: null
  };

  constructor(private hmctl: HmctlClient) {
    this.loadCache();
  }


  private loadCache() {
    try {
      if (fs.existsSync(this.CACHE_FILE)) {
        const data = fs.readFileSync(this.CACHE_FILE, 'utf8');
        this.lastSuccessfulState = JSON.parse(data);
      }
    } catch (e) {
      this.logger.warn('Could not load SSL cache from disk: ' + e.message);
    }
  }

  private saveCache() {
    try {
      // Ensure directory exists (uploads directory is mounted by default)
      if (!fs.existsSync('/app/uploads')) {
        fs.mkdirSync('/app/uploads', { recursive: true });
      }
      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(this.lastSuccessfulState), 'utf8');
    } catch (e) {
      this.logger.warn('Could not save SSL cache to disk: ' + e.message);
    }
  }

  async getStatus() {
    let exists = false;
    let expiration = null;
    let daysRemaining = null;
    let issuer = null;
    let provider = 'Unknown';
    let certPathInUse = 'Not Found';
    let isHttpsEnabled = false;
    let currentError = null;

    this.lastDiagnostics.domainProbed = this.domain;
    this.lastDiagnostics.lastCheckTime = new Date().toISOString();

    // We will attempt to run `docker exec hmpanel-nginx` to inspect the actual live container state.
    // This is required because the certs and configurations are not mapped to the panel container.
    try {
      // Check for HTTPS enabled in nginx configuration
      const { stdout: nginxConfOut } = await execAsync('docker exec hmpanel-nginx cat /etc/nginx/nginx.conf 2>/dev/null || true');
      if (nginxConfOut.includes('listen 443 ssl') || nginxConfOut.includes('ssl_certificate')) {
        isHttpsEnabled = true;
      }

      // Check if certificate file exists in nginx container
      const { stdout: certLsOut } = await execAsync('docker exec hmpanel-nginx ls /etc/nginx/ssl/fullchain.pem 2>/dev/null || true');
      if (certLsOut.includes('/etc/nginx/ssl/fullchain.pem')) {
        exists = true;
        certPathInUse = '/etc/nginx/ssl/fullchain.pem';

        // Extract certificate details using LOCAL openssl (panel container has openssl installed)
        // The cert is mounted at /etc/nginx/ssl/ in both nginx and panel containers
        try {
          const localCertPath = '/etc/nginx/ssl/fullchain.pem';
          if (fs.existsSync(localCertPath)) {
            const { stdout: enddateOut } = await execAsync(`openssl x509 -enddate -noout -in ${localCertPath}`);
            const { stdout: issuerOut } = await execAsync(`openssl x509 -issuer -noout -in ${localCertPath}`);
            
            const dateStr = enddateOut.replace('notAfter=', '').trim();
            const expDate = new Date(dateStr);
            expiration = expDate.toISOString();
            
            const now = new Date();
            const diffTime = Math.abs(expDate.getTime() - now.getTime());
            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (expDate.getTime() < now.getTime()) {
              daysRemaining = -daysRemaining;
            }

            issuer = issuerOut.replace('issuer=', '').trim();
            this.lastDiagnostics.certificateExpiration = expiration;
            this.lastDiagnostics.certificateIssuer = issuer;
            this.lastDiagnostics.tlsHandshakeStatus = 'Local Certificate Parsed';
          } else {
            // Fallback: try docker exec into nginx (unlikely to have openssl but worth trying)
            const { stdout: enddateOut } = await execAsync('docker exec hmpanel-nginx openssl x509 -enddate -noout -in /etc/nginx/ssl/fullchain.pem');
            const { stdout: issuerOut } = await execAsync('docker exec hmpanel-nginx openssl x509 -issuer -noout -in /etc/nginx/ssl/fullchain.pem');
            
            const dateStr = enddateOut.replace('notAfter=', '').trim();
            const expDate = new Date(dateStr);
            expiration = expDate.toISOString();
            
            const now = new Date();
            const diffTime = Math.abs(expDate.getTime() - now.getTime());
            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (expDate.getTime() < now.getTime()) {
              daysRemaining = -daysRemaining;
            }

            issuer = issuerOut.replace('issuer=', '').trim();
            this.lastDiagnostics.certificateExpiration = expiration;
            this.lastDiagnostics.certificateIssuer = issuer;
            this.lastDiagnostics.tlsHandshakeStatus = 'Local File System Checked';
          }
        } catch (certError) {
          currentError = certError.message;
          this.logger.error('Failed to parse certificate', certError.message);
        }
      }

      // Detect SSL Provider via inspecting the hmpanel-nginx container mounts
      const { stdout: inspectOut } = await execAsync('docker inspect hmpanel-nginx');
      const nginxData = JSON.parse(inspectOut);
      const mounts = nginxData[0]?.Mounts || [];

      // Check for Let's Encrypt / Certbot mounts
      const letsEncryptMount = mounts.find((m: any) => m.Destination.includes('letsencrypt') || m.Source.includes('letsencrypt'));
      
      // Also we can check if ACME is installed locally
      const isAcmeInstalled = fs.existsSync(this.acmeShPath);

      if (exists) {
        if (letsEncryptMount) {
          provider = 'Certbot';
          certPathInUse = letsEncryptMount.Destination;
        } else if (isAcmeInstalled) {
          provider = 'ACME.sh';
        } else {
          provider = 'Custom Certificate';
        }
      } else if (isHttpsEnabled) {
        // Reverse proxy scenario where HTTPS is enabled but nginx container does not handle certs directly
        exists = true;
        provider = 'Reverse Proxy / Custom';
        certPathInUse = 'External / Host Managed';
      }

    } catch (e) {
      this.logger.warn('Docker socket access failed. Falling back to live HTTPS probe...');
      
      // Fallback: Live HTTPS probe trying multiple internal and external hostnames
      let cert = null;
      let usedHostname = '';
      const hostnamesToTry = [];
      
      // Only probe the actual domain, never localhost or 127.0.0.1
      if (this.domain && this.domain !== 'localhost' && this.domain !== '127.0.0.1') {
        hostnamesToTry.push(this.domain);
      }

      // ALWAYS fallback to internal nginx container to read the active certificate if external probe fails or domain is not set
      hostnamesToTry.push('hmpanel-nginx');

      for (const host of hostnamesToTry) {
        try {
          cert = await this.getPeerCertificate(host);
          usedHostname = host;
          this.lastDiagnostics.tlsHandshakeStatus = `Success via ${host}`;
          this.lastDiagnostics.lastProbeError = null;
          break; // Stop at first successful probe
        } catch (err) {
          currentError = err.message;
          this.lastDiagnostics.lastProbeError = `Failed on ${host}: ${err.message}`;
        }
      }

      if (cert) {
        exists = true;
        isHttpsEnabled = true;
        certPathInUse = `Live Probe via ${usedHostname}`;
        
        const expDate = new Date(cert.valid_to);
        expiration = expDate.toISOString();
        
        const now = new Date();
        const diffTime = Math.abs(expDate.getTime() - now.getTime());
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (expDate.getTime() < now.getTime()) {
          daysRemaining = -daysRemaining;
        }

        const certIssuer = cert.issuer?.CN || cert.issuer?.O || 'Unknown Issuer';
        issuer = certIssuer;
        provider = 'Unknown';

        this.lastDiagnostics.certificateExpiration = expiration;
        this.lastDiagnostics.certificateIssuer = issuer;
      } else {
        this.logger.error('All live HTTPS probes failed. SSL is likely disabled, misconfigured, or inaccessible from container.');
        provider = 'Unknown / Diagnostic Mode';
        this.lastDiagnostics.tlsHandshakeStatus = 'Failed all probes';
      }
    }

    // Determine mode
    const isIp = /^[0-9\.]+$/.test(this.domain);
    let mode = '';
    if (isIp && isHttpsEnabled) mode = 'IP HTTPS';
    else if (isIp && !isHttpsEnabled) mode = 'IP HTTP';
    else if (!isIp && isHttpsEnabled) mode = 'Domain HTTPS';
    else mode = 'Domain HTTP';

    let warning = null;

    // Caching Logic: If current check failed but we have a cached valid state, fallback to cache
    if (!exists && this.lastSuccessfulState && this.lastSuccessfulState.certificate?.exists) {
      warning = 'Live detection failed. Showing last known valid configuration. Error: ' + (currentError || 'Timeout');
      return {
        ...this.lastSuccessfulState,
        warning,
        diagnostics: this.lastDiagnostics
      };
    }

    const result = {
      mode,
      domain: this.domain,
      isHttpsEnabled,
      provider,
      certPath: certPathInUse,
      certificate: {
        exists,
        ...(exists && expiration ? { expiration, daysRemaining, issuer } : {})
      },
      warning,
      diagnostics: this.lastDiagnostics
    };

    if (exists) {
      this.lastSuccessfulState = result;
      this.saveCache();
    }

    return result;
  }

  async renew() {
    try {
      this.logger.log(`Triggering host renewal...`);
      const result = await this.hmctl.execute('ssl', 'renew');
      this.logger.log(`Renewal result: ${JSON.stringify(result)}`);
      return { success: true, log: result.log || 'Success' };
    } catch (e) {
      this.logger.error('Renewal failed', e);
      throw new HttpException('Renewal failed: ' + e.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async switchMode(enableHttps: boolean) {
    try {
      const cmdAction = enableHttps ? 'repair' : 'disable';
      await this.hmctl.execute('ssl', cmdAction);
      return { success: true, https: enableHttps };
    } catch (e) {
      throw new HttpException('Failed to switch SSL mode: ' + e.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('Running daily ACME renewal check via host...');
    try {
      const result = await this.hmctl.execute('ssl', 'renew');
      this.logger.log('ACME cron result: ' + JSON.stringify(result));
    } catch (e) {
      this.logger.error('ACME cron failed', e);
    }
  }
}

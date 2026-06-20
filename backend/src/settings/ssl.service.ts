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
  private readonly domain = process.env.DOMAIN || 'localhost';

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

  async getStatus() {
    let exists = false;
    let expiration = null;
    let daysRemaining = null;
    let issuer = null;
    let provider = 'Unknown';
    let certPathInUse = 'Not Found';
    let isHttpsEnabled = false;

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

        // Extract certificate details
        try {
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
        } catch (certError) {
          this.logger.error('Failed to parse certificate within nginx container', certError.message);
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
      const hostnamesToTry = ['hmpanel-nginx', 'nginx', this.domain, '127.0.0.1'];

      for (const host of hostnamesToTry) {
        try {
          cert = await this.getPeerCertificate(host);
          usedHostname = host;
          break; // Stop at first successful probe
        } catch (err) {
          // Continue to next host
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
      } else {
        this.logger.error('All live HTTPS probes failed. SSL is likely disabled, misconfigured, or inaccessible from container.');
        provider = 'Unknown / Diagnostic Mode';
      }
    }

    // Determine mode
    const isIp = /^[0-9\.]+$/.test(this.domain);
    let mode = '';
    if (isIp && isHttpsEnabled) mode = 'IP HTTPS';
    else if (isIp && !isHttpsEnabled) mode = 'IP HTTP';
    else if (!isIp && isHttpsEnabled) mode = 'Domain HTTPS';
    else mode = 'Domain HTTP';

    return {
      mode,
      domain: this.domain,
      isHttpsEnabled,
      provider,
      certPath: certPathInUse,
      certificate: {
        exists,
        ...(exists && expiration ? { expiration, daysRemaining, issuer } : {})
      }
    };
  }

  async renew() {
    if (!fs.existsSync(this.acmeShPath)) {
      throw new HttpException('ACME.sh is not installed. Cannot renew automatically.', HttpStatus.BAD_REQUEST);
    }
    
    try {
      this.logger.log(`Forcing ACME renewal for ${this.domain}...`);
      const { stdout, stderr } = await execAsync(`"${this.acmeShPath}" --home /app/acme.sh --renew -d "${this.domain}" --force`);
      this.logger.log(stdout);
      
      // Reload nginx if successful
      if (stdout.includes('Success') || stdout.includes('Cert success')) {
        await this.reloadNginx();
      }
      
      return { success: true, log: stdout };
    } catch (e) {
      this.logger.error('Renewal failed', e);
      throw new HttpException('Renewal failed: ' + (e.stdout || e.message), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async switchMode(enableHttps: boolean) {
    if (!fs.existsSync(this.nginxConfPath)) {
      throw new HttpException('Nginx config not found.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    
    let conf = fs.readFileSync(this.nginxConfPath, 'utf8');
    
    if (enableHttps) {
      if (!fs.existsSync(this.certPath)) {
        throw new HttpException('Cannot enable HTTPS. No certificate found.', HttpStatus.BAD_REQUEST);
      }
      conf = conf.replace(/# SSL disabled/g, 'listen 443 ssl http2;');
    } else {
      conf = conf.replace(/listen 443 ssl http2;/g, '# SSL disabled');
    }
    
    fs.writeFileSync(this.nginxConfPath, conf);
    
    try {
      await this.reloadNginx(true); // Must restart to trigger envsubst on the new template
      return { success: true, https: enableHttps };
    } catch (e) {
      throw new HttpException('Failed to reload Nginx after config change.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async reloadNginx(restart: boolean = false) {
    if (restart) {
      this.logger.log('Restarting Nginx proxy to apply template changes...');
      await execAsync('docker restart hmpanel-nginx');
    } else {
      this.logger.log('Reloading Nginx proxy...');
      await execAsync('docker exec hmpanel-nginx nginx -s reload');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    if (!fs.existsSync(this.acmeShPath)) return;
    this.logger.log('Running daily ACME renewal check...');
    try {
      const { stdout } = await execAsync(`"${this.acmeShPath}" --home /app/acme.sh --cron`);
      this.logger.log('ACME cron result: ' + stdout);
    } catch (e) {
      this.logger.error('ACME cron failed', e);
    }
  }
}

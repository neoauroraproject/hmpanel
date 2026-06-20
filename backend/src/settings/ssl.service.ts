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

  async getStatus() {
    let exists = false;
    let expiration = null;
    let daysRemaining = null;
    let issuer = null;
    let provider = 'Unknown';
    let certPathInUse = 'Not Found';

    let isHttpsEnabled = false;
    if (fs.existsSync(this.nginxConfPath)) {
      const conf = fs.readFileSync(this.nginxConfPath, 'utf8');
      if (conf.includes('listen 443 ssl')) {
        isHttpsEnabled = true;
      }
    }

    const isAcmeInstalled = fs.existsSync(this.acmeShPath);

    // Default panel mount
    if (fs.existsSync(this.certPath)) {
      exists = true;
      certPathInUse = this.certPath;
      if (isAcmeInstalled) {
        provider = 'ACME.sh';
      } else {
        provider = 'Custom Certificate';
      }
      
      try {
        const { stdout: enddateOut } = await execAsync(`openssl x509 -enddate -noout -in ${this.certPath}`);
        const { stdout: issuerOut } = await execAsync(`openssl x509 -issuer -noout -in ${this.certPath}`);
        
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
        if (issuer.toLowerCase().includes('let\'s encrypt')) {
          if (!isAcmeInstalled) provider = 'Certbot';
        }
      } catch (e) {
        this.logger.error('Failed to parse certificate', e.message);
      }
    }

    // Secondary check: Certbot mounted into Nginx container
    if (!exists) {
      try {
        const inspectNginx = await execAsync('docker inspect hmpanel-nginx');
        const nginxData = JSON.parse(inspectNginx.stdout);
        const letsEncryptMount = nginxData[0]?.Mounts?.find((m: any) => m.Destination.includes('letsencrypt') || m.Source.includes('letsencrypt'));
        if (letsEncryptMount) {
          provider = 'Certbot';
          certPathInUse = letsEncryptMount.Destination;
          exists = true;
        }
      } catch (e) {
        // Ignore
      }
    }

    // Tertiary check: Reverse Proxy
    if (isHttpsEnabled && !exists) {
      exists = true;
      provider = 'Reverse Proxy / Custom';
      certPathInUse = 'External / Host Managed';
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
      certificate: exists ? {
        exists: true,
        expiration,
        daysRemaining,
        issuer
      } : { exists: false }
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

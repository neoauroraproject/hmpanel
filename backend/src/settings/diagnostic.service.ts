import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SslService } from './ssl.service';
import { SettingsService } from './settings.service';

const execAsync = promisify(exec);

@Injectable()
export class DiagnosticService {
  constructor(
    private readonly sslService: SslService,
    private readonly settingsService: SettingsService,
  ) {}

  async getDiagnostics() {
    // 1. Version Info
    const updateInfo = await this.settingsService.checkUpdate();
    
    // 2. Container & Installation Info
    let containerInfo = { id: 'Unknown', image: 'Unknown', tag: 'Unknown', uptime: 'Unknown' };
    let installPath = 'Unknown';
    try {
      const inspectRes = await execAsync('docker inspect hmpanel-panel');
      const data = JSON.parse(inspectRes.stdout)[0];
      containerInfo.id = data.Id.substring(0, 12);
      containerInfo.image = data.Config.Image;
      containerInfo.uptime = data.State.StartedAt;
      
      const tagMatch = data.Config.Image.match(/:([^:]+)$/);
      containerInfo.tag = tagMatch ? tagMatch[1] : 'latest';

      installPath = data.Config.Labels['com.docker.compose.project.working_dir'] || 'Unknown';
      if (installPath === 'Unknown') {
        const envMount = data.Mounts.find((m: any) => m.Destination === '/app/.env');
        if (envMount) installPath = require('path').dirname(envMount.Source);
      }
    } catch (e) {}

    // 3. Host Info
    const hostInfo = {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model || 'Unknown',
      ram: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      freeRam: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
    };

    // 4. Docker Info
    let dockerInfo = { version: 'Unknown', composeVersion: 'Unknown', socketAccess: false };
    try {
      const dVer = await execAsync('docker -v');
      dockerInfo.version = dVer.stdout.trim();
      dockerInfo.socketAccess = true;
      try {
         const dcVer = await execAsync('docker compose version');
         dockerInfo.composeVersion = dcVer.stdout.trim();
      } catch (e) {}
    } catch (e) {}

    // 5. Services
    let services = {
      postgres: 'Offline',
      redis: 'Offline',
      backend: 'Online (Self)',
    };
    try {
      await execAsync('docker exec hmpanel-postgres pg_isready -U panel_user -d panel_db');
      services.postgres = 'Online';
    } catch (e) {}
    try {
      await execAsync('docker exec hmpanel-redis redis-cli ping');
      services.redis = 'Online';
    } catch (e) {}

    // 6. SSL
    const ssl = await this.sslService.getStatus();

    // 7. Connectivity
    let connectivity = { github: 'Unreachable' };
    try {
      await execAsync('curl -Is https://api.github.com | head -1');
      connectivity.github = 'Reachable';
    } catch (e) {}

    return {
      version: updateInfo,
      container: containerInfo,
      host: hostInfo,
      docker: dockerInfo,
      services,
      ssl,
      connectivity,
      installation: {
        path: installPath,
        updateScript: fs.existsSync('/app/nginx_host/../update.sh') || fs.existsSync(installPath + '/update.sh') ? 'Found' : 'Not Found',
      }
    };
  }
}

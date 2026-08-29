import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getAppVersionTag } from '../common/utils/app-version';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSetting(key: string, defaultValue: any = null) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    if (!setting) return defaultValue;
    try {
      return JSON.parse(setting.value);
    } catch {
      return setting.value;
    }
  }

  async getAllSettings() {
    const settings = await this.prisma.systemSetting.findMany();
    const result: Record<string, any> = {
      display_timezone: 'Asia/Tehran',
      display_calendar: 'jalali',
    };
    for (const s of settings) {
      try {
        result[s.key] = JSON.parse(s.value);
      } catch {
        result[s.key] = s.value;
      }
    }
    if (!result.display_timezone) {
      result.display_timezone = 'Asia/Tehran';
    }
    if (
      result.display_calendar !== 'jalali' &&
      result.display_calendar !== 'gregorian'
    ) {
      result.display_calendar = 'jalali';
    }
    return result;
  }

  async getDisplayTimezone(): Promise<string> {
    const tz = await this.getSetting('display_timezone', 'Asia/Tehran');
    return typeof tz === 'string' && tz.trim() ? tz.trim() : 'Asia/Tehran';
  }

  async getDisplayCalendar(): Promise<'jalali' | 'gregorian'> {
    const cal = await this.getSetting('display_calendar', 'jalali');
    return cal === 'gregorian' ? 'gregorian' : 'jalali';
  }

  async setSetting(key: string, value: any) {
    const valueStr = JSON.stringify(value);
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: valueStr },
      create: { key, value: valueStr },
    });
  }

  async setSettings(settings: Record<string, any>) {
    const results = [];
    for (const [key, value] of Object.entries(settings)) {
      results.push(await this.setSetting(key, value));
    }
    return results;
  }

  getCurrentVersion() {
    return getAppVersionTag();
  }

  private cachedUpdateResult: any = null;
  private lastUpdateCheckTime: number = 0;

  private pickNewerSemver(a?: string | null, b?: string | null): string | null {
    const semver = require('semver');
    const clean = (v?: string | null) =>
      String(v || '')
        .trim()
        .replace(/^v/, '');
    const ca = clean(a);
    const cb = clean(b);
    const va = semver.valid(ca);
    const vb = semver.valid(cb);
    if (va && vb) return semver.gte(va, vb) ? va : vb;
    if (va) return va;
    if (vb) return vb;
    return null;
  }

  async checkUpdate() {
    try {
      const axios = require('axios');
      const semver = require('semver');
      const fs = require('fs');

      const now = Date.now();
      // Cache for 5 minutes (was 1h) so Settings refresh sees new releases sooner
      if (this.cachedUpdateResult && now - this.lastUpdateCheckTime < 300_000) {
        return this.cachedUpdateResult;
      }

      const headers = { 'User-Agent': 'HMPanel' };
      let releaseVersion: string | null = null;
      let mainVersion: string | null = null;

      try {
        const response = await axios.get(
          'https://api.github.com/repos/neoauroraproject/hmpanel/releases/latest',
          { headers, timeout: 8000 },
        );
        releaseVersion = response.data?.tag_name || null;
      } catch (e: any) {
        console.warn('checkUpdate: releases/latest failed:', e?.message || e);
      }

      // Same source hm update uses — VERSION on main tracks shipping image.
      try {
        const verRes = await axios.get(
          'https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/VERSION',
          { headers, timeout: 8000, responseType: 'text' },
        );
        mainVersion = String(verRes.data || '')
          .trim()
          .replace(/\r/g, '');
      } catch (e: any) {
        console.warn('checkUpdate: main VERSION failed:', e?.message || e);
      }

      const latestClean = this.pickNewerSemver(releaseVersion, mainVersion);
      const currentVersion = this.getCurrentVersion();
      const currentClean = String(currentVersion || '')
        .trim()
        .replace(/^v/, '');

      const hasUpdate =
        !!latestClean &&
        !!semver.valid(currentClean) &&
        semver.gt(latestClean, currentClean);

      let canAutoUpdate = false;
      try {
        if (
          fs.existsSync('/var/run/docker.sock') ||
          fs.existsSync('/run/docker.sock')
        ) {
          canAutoUpdate = true;
        }
      } catch {
        canAutoUpdate = false;
      }

      const latestVersion = latestClean
        ? latestClean.startsWith('v')
          ? latestClean
          : `v${latestClean}`
        : releaseVersion || mainVersion || 'unknown';

      const result = {
        hasUpdate,
        latestVersion,
        currentVersion,
        canAutoUpdate,
        sources: {
          release: releaseVersion,
          main: mainVersion,
        },
      };

      this.cachedUpdateResult = result;
      this.lastUpdateCheckTime = now;

      return result;
    } catch (error: any) {
      console.error('Failed to check for updates:', error?.message || error);

      if (this.cachedUpdateResult) {
        return this.cachedUpdateResult;
      }

      return {
        hasUpdate: false,
        latestVersion: 'unknown',
        currentVersion: this.getCurrentVersion(),
        canAutoUpdate: false,
      };
    }
  }

  /** Force next checkUpdate to hit the network (e.g. before starting update). */
  clearUpdateCache() {
    this.cachedUpdateResult = null;
    this.lastUpdateCheckTime = 0;
  }

  async updatePanel() {
    const { promisify } = require('util');
    const { exec, execFile } = require('child_process');
    const execAsync = promisify(exec);
    const execFileAsync = promisify(execFile);
    const { HttpException, HttpStatus } = require('@nestjs/common');

    try {
      // 1. Check if update is actually needed to prevent abuse
      this.clearUpdateCache();
      const updateStatus = await this.checkUpdate();
      if (
        !updateStatus.hasUpdate &&
        updateStatus.currentVersion !== 'vUnknown'
      ) {
        throw new HttpException(
          'Already running the latest version',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 2. PRE-FLIGHT: Docker Socket Check
      try {
        await execAsync('docker ps');
      } catch (e) {
        throw new HttpException(
          'Docker socket unavailable.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 3. PRE-FLIGHT: Database Connection Check
      try {
        await execAsync(
          'docker exec hmpanel-postgres pg_isready -U panel_user -d panel_db',
        );
      } catch (e) {
        throw new HttpException(
          'Database connection failed.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 3.1 PRE-FLIGHT: Redis Connection Check
      try {
        await execAsync('docker exec hmpanel-redis redis-cli ping');
      } catch (e) {
        throw new HttpException(
          'Redis connection failed.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 3.2 PRE-FLIGHT: GitHub Reachability
      try {
        await execAsync('curl -Is https://api.github.com | head -1');
      } catch (e) {
        throw new HttpException(
          'GitHub unreachable.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 4. PRE-FLIGHT: Find the installation directory
      const inspectRes = await execAsync('docker inspect hmpanel-panel');
      const inspectData = JSON.parse(inspectRes.stdout);

      let installDir =
        inspectData[0].Config.Labels['com.docker.compose.project.working_dir'];
      if (!installDir) {
        const envMount = inspectData[0].Mounts.find(
          (m: any) => m.Destination === '/app/.env',
        );
        if (envMount) {
          installDir = require('path').dirname(envMount.Source);
        }
      }

      if (!installDir) {
        throw new HttpException(
          'Could not determine installation directory from container mounts.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 5. PRE-FLIGHT: Backup Creation
      const fs = require('fs');
      try {
        await execAsync(
          'docker exec hmpanel-postgres pg_dump -U panel_user -d panel_db > /app/backups/db_backup_pre_update.sql',
        );
      } catch (e) {
        throw new HttpException(
          'Backup failed.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 6. PRE-FLIGHT: Rollback Safety Marker
      try {
        const rollbackData = {
          timestamp: new Date().toISOString(),
          version: updateStatus.currentVersion,
          image: inspectData[0].Image,
          backupFile: 'db_backup_pre_update.sql',
        };
        fs.writeFileSync(
          '/app/backups/rollback_meta.json',
          JSON.stringify(rollbackData, null, 2),
        );
      } catch (e) {
        throw new HttpException(
          'Rollback prep failed.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      console.log(`Starting panel update. Install dir: ${installDir}`);

      const logMount = inspectData[0].Mounts.find(
        (m: any) => m.Destination === '/app/logs',
      );
      const logVolumeName = logMount ? logMount.Name : 'hmpanel_logs';

      // 7. Clear old log and write initial progress
      const logPath = '/app/logs/updater.log';
      const appendLog = (line: string) => {
        try {
          fs.appendFileSync(logPath, `${line}\n`);
        } catch {
          /* ignore */
        }
      };
      fs.writeFileSync(
        logPath,
        '[1/7] Checking Versions (Passed)\n[2/7] Creating Backup (Passed)\n[3/7] Initializing Detached Updater...\n',
      );

      // Drop any leftover updater container so docker run --name does not fail silently.
      try {
        await execAsync('docker rm -f hmpanel-updater');
        appendLog('[updater] removed stale hmpanel-updater container');
      } catch {
        /* none running */
      }

      // Best-effort image pull so apk/network issues surface before detach.
      try {
        appendLog('[updater] pulling docker:latest (may take a minute)...');
        await execAsync('docker pull docker:latest', { timeout: 120_000 });
        appendLog('[updater] docker:latest ready');
      } catch (pullErr: any) {
        appendLog(
          `[updater] warn: docker pull failed (${pullErr?.message || pullErr}) — continuing with local image`,
        );
      }

      // 8. Run updater on the HOST (nsenter) so docker compose / hm / openssl
      // are available. The previous approach ran update.sh inside docker:latest,
      // which often lacks Compose — UI could still show "success" while the
      // stack never recovered.
      const updateScriptPath = `${installDir}/.update-run.sh`;
      const updaterShell = [
        'LOG=/updater-logs/updater.log',
        'fail() { echo "[UPDATE_FAILED] $1" >> "$LOG"; exit 1; }',
        'echo "[3/7] Detached updater started" >> "$LOG"',
        'echo "[updater] installing apk packages: bash curl util-linux..." >> "$LOG"',
        'apk add --no-cache bash curl util-linux >> "$LOG" 2>&1 || fail "apk add failed (network/mirror?)"',
        'echo "[updater] apk packages OK" >> "$LOG"',
        'echo "[4/7] Running master update.sh on host via nsenter..." >> "$LOG"',
        `if [ -f "${installDir}/update.sh" ]; then`,
        `  cp "${installDir}/update.sh" "${updateScriptPath}" >> "$LOG" 2>&1 || fail "copy local update.sh failed"`,
        `  echo "[updater] using bundled update.sh from install dir" >> "$LOG"`,
        'else',
        `  echo "[updater] downloading update.sh from GitHub..." >> "$LOG"`,
        `  curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/update.sh -o "${updateScriptPath}" >> "$LOG" 2>&1 || fail "curl update.sh failed (GitHub unreachable?)"`,
        'fi',
        `chmod +x "${updateScriptPath}"`,
        'echo "[updater] launching update.sh via nsenter..." >> "$LOG"',
        `nsenter -t 1 -m -u -i -n -- bash "${updateScriptPath}" >> "$LOG" 2>&1`,
        'EC=$?',
        'echo "[updater] exit=$EC" >> "$LOG"',
        'if [ "$EC" -ne 0 ]; then echo "[UPDATE_FAILED] update.sh exited $EC" >> "$LOG"; fi',
        `rm -f "${updateScriptPath}"`,
        'exit $EC',
      ].join('\n');

      // execFile (not exec string) — avoids host shell expanding $LOG/$EC inside updaterShell.
      try {
        await execFileAsync('docker', [
          'run',
          '-d',
          '--name',
          'hmpanel-updater',
          '--rm',
          '--privileged',
          '--pid=host',
          '-v',
          `${installDir}:${installDir}`,
          '-v',
          `${logVolumeName}:/updater-logs`,
          'docker:latest',
          '/bin/sh',
          '-c',
          updaterShell,
        ]);
        appendLog('[updater] hmpanel-updater container started');
      } catch (runErr: any) {
        appendLog(`[UPDATE_FAILED] docker run failed: ${runErr?.message || runErr}`);
        throw new HttpException(
          'Failed to start detached updater: ' + (runErr?.message || runErr),
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        message:
          'Update process initiated. Panel will be back in a few minutes.',
      };
    } catch (error) {
      console.error('Failed to start update process:', error);
      if (error.status) throw error; // Re-throw HttpExceptions
      throw new HttpException(
        'Failed to initiate update: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async runSslDiagnostic() {
    try {
      const fs = require('fs');
      const { promisify } = require('util');
      const { exec } = require('child_process');
      const execAsync = promisify(exec);

      const certPath = '/etc/nginx/ssl/fullchain.pem';
      const nginxConfPath = '/app/nginx_host/nginx.conf.template';
      const acmeShPath = '/app/acme.sh/acme.sh';
      const acmeHostReq = '/app/acme_host';

      const pathsToVerify = {
        '/app/nginx_host': fs.existsSync('/app/nginx_host'),
        [nginxConfPath]: fs.existsSync(nginxConfPath),
        [acmeHostReq]: fs.existsSync(acmeHostReq),
        '/app/acme.sh': fs.existsSync('/app/acme.sh'),
        [acmeShPath]: fs.existsSync(acmeShPath),
        '/etc/nginx/ssl': fs.existsSync('/etc/nginx/ssl'),
        [certPath]: fs.existsSync(certPath),
      };

      const inspectRes = await execAsync('docker inspect hmpanel-panel');
      const inspectData = JSON.parse(inspectRes.stdout);
      const mounts = inspectData[0].Mounts;

      console.log('====== SSL DIAGNOSTIC AUDIT ======');
      console.log('Docker Mounts:', JSON.stringify(mounts, null, 2));
      console.log(
        'Resolved Nginx Path:',
        nginxConfPath,
        'Exists:',
        pathsToVerify[nginxConfPath],
      );
      console.log(
        'Resolved Certificate Path:',
        certPath,
        'Exists:',
        pathsToVerify[certPath],
      );
      console.log(
        'Path Existence Checks:',
        JSON.stringify(pathsToVerify, null, 2),
      );
      console.log('==================================');

      return {
        success: true,
        report: {
          dockerMounts: mounts,
          exactFilePathsUsed: {
            certPath,
            nginxConfPath,
            acmeShPath,
          },
          pathExistence: pathsToVerify,
        },
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getUpdateLogs() {
    try {
      const fs = require('fs');
      const { promisify } = require('util');
      const { exec } = require('child_process');
      const execAsync = promisify(exec);
      const logPath = '/app/logs/updater.log';

      let logs = '';
      if (fs.existsSync(logPath)) {
        logs = fs.readFileSync(logPath, 'utf8');
      } else {
        logs = 'Waiting for updater to start...';
      }

      const healthy =
        logs.includes('Backend API is healthy') ||
        /successfully updated to version/i.test(logs);
      let failedMarkers =
        logs.includes('[UPDATE_FAILED]') ||
        logs.includes('Update aborted') ||
        logs.includes('MIGRATION FAILED') ||
        logs.includes('Docker Compose is not available') ||
        /\[updater\] exit=[1-9]/.test(logs) ||
        (logs.includes('Health check timeout') && !healthy);

      let updaterRunning = false;
      try {
        const { stdout } = await execAsync(
          'docker inspect hmpanel-updater --format="{{.State.Status}}"',
        );
        updaterRunning = stdout.trim() === 'running';
      } catch {
        updaterRunning = false;
      }

      // Stuck at step 3: container died before [4/7] with no success → treat as failed
      // so the UI leaves "in progress" instead of polling forever.
      const reachedHostUpdate = logs.includes('[4/7]');
      if (!updaterRunning && !healthy && !reachedHostUpdate && logs.includes('[3/7]')) {
        failedMarkers = true;
        if (!logs.includes('[UPDATE_FAILED]')) {
          logs +=
            '\n[UPDATE_FAILED] Detached updater exited before host update started. Check apk/network or docker logs for hmpanel-updater.';
        }
      }

      // Never treat image-prune lines ("Total reclaimed space") as success.
      const completed = !updaterRunning && (healthy || failedMarkers);
      const updateSuccess = Boolean(healthy);

      return {
        success: true,
        logs,
        completed,
        updateSuccess,
        failed: completed && !updateSuccess,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to read logs: ' + error.message,
        completed: false,
        updateSuccess: false,
        failed: false,
      };
    }
  }
}

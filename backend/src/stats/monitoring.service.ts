import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

export interface PanelSpeedData {
  panelId: string;
  panelName: string;
  cpu: number;
  ram: number;
  disk: number;
  up: number; // Bandwidth up bytes/sec
  down: number; // Bandwidth down bytes/sec
  xrayStatus: string;
  panelVersion: string;
  online: boolean;
  latencyMs: number;
}

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);

  // Caches
  private serverStatusCache: PanelSpeedData[] = [];

  // Polling loops
  private serverStatusTimer: NodeJS.Timeout;

  // Track previous traffic for speed calculation
  private previousTraffic: Record<
    string,
    { up: bigint; down: bigint; time: number }
  > = {};

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Starting Monitoring Cache Loops...');

    // Server Status every 3 seconds
    this.serverStatusTimer = setInterval(() => this.pollServerStatus(), 3000);
    // Initial fetch
    this.pollServerStatus();

    // Initial fetch
    this.pollServerStatus();
  }

  onModuleDestroy() {
    if (this.serverStatusTimer) clearInterval(this.serverStatusTimer);
  }

  // Getters for WebSocket/Gateway
  public getLatestServerStatus(): PanelSpeedData[] {
    return this.serverStatusCache;
  }

  private async pollServerStatus() {
    try {
      const panels = await this.prisma.panel.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          version: true,
          apiToken: true,
          apiBaseUrl: true,
          url: true,
        },
      });

      const results = await Promise.all(
        panels.map(async (p) => {
          if (p.status !== 'online') {
            return {
              panelId: p.id,
              panelName: p.name,
              cpu: 0,
              ram: 0,
              disk: 0,
              up: 0,
              down: 0,
              xrayStatus: 'stopped',
              panelVersion: p.version || 'unknown',
              online: false,
              latencyMs: 0,
            };
          }

          const apiBaseUrl = p.apiBaseUrl || p.url.replace(/\/$/, '');
          const startTime = Date.now();
          let cpu = 0,
            ram = 0,
            disk = 0,
            upBytes = 0n,
            downBytes = 0n;
          let online = false;

          try {
            const res = await axios.get(
              `${apiBaseUrl}/panel/api/server/status`,
              {
                headers: {
                  Authorization: p.apiToken
                    ? `Bearer ${p.apiToken}`
                    : undefined,
                },
                timeout: 2500, // Very fast timeout so it doesn't block
              },
            );

            if (res.data && res.data.success) {
              online = true;
              const obj = res.data.obj || {};
              cpu = typeof obj.cpu === 'number' ? obj.cpu : 0;
              const memCurrent = obj.mem?.current ? Number(obj.mem.current) : 0;
              const memTotal = obj.mem?.total ? Number(obj.mem.total) : 1;
              ram = (memCurrent / memTotal) * 100;
              const diskCurrent = obj.disk?.current
                ? Number(obj.disk.current)
                : 0;
              const diskTotal = obj.disk?.total ? Number(obj.disk.total) : 1;
              disk = (diskCurrent / diskTotal) * 100;

              upBytes = obj.netTraffic?.sent
                ? BigInt(obj.netTraffic.sent)
                : obj.netIO?.up
                  ? BigInt(obj.netIO.up)
                  : 0n;
              downBytes = obj.netTraffic?.recv
                ? BigInt(obj.netTraffic.recv)
                : obj.netIO?.down
                  ? BigInt(obj.netIO.down)
                  : 0n;
            }
          } catch (err) {
            online = false;
          }

          const latency = Date.now() - startTime;
          const nowTime = Date.now();

          let speedUp = 0;
          let speedDown = 0;

          const prev = this.previousTraffic[p.id];
          if (prev && online) {
            const timeDiffSec = (nowTime - prev.time) / 1000;
            if (timeDiffSec > 0) {
              const upDiff = Number(upBytes - prev.up);
              const downDiff = Number(downBytes - prev.down);
              speedUp = Math.max(0, upDiff / timeDiffSec);
              speedDown = Math.max(0, downDiff / timeDiffSec);
            }
          }

          if (online) {
            this.previousTraffic[p.id] = {
              up: upBytes,
              down: downBytes,
              time: nowTime,
            };
          }

          return {
            panelId: p.id,
            panelName: p.name,
            cpu,
            ram,
            disk,
            up: speedUp,
            down: speedDown,
            xrayStatus: online ? 'running' : 'stopped',
            panelVersion: p.version || 'unknown',
            online,
            latencyMs: latency,
          };
        }),
      );

      this.serverStatusCache = results;
    } catch (err) {
      this.logger.error('Failed to poll server status: ' + err.message);
    }
  }
}

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { resolvePanelApiBaseUrl } from '../common/utils/panel-url.util';
import {
  isExternalPanelType,
} from '../panels/native/native-panel-capabilities';
import { UnifiedMonitoringHub } from '../monitoring/unified-monitoring.hub';

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
  hasCpu?: boolean;
  hasRam?: boolean;
  hasDisk?: boolean;
}

/** Live dashboard cadence while at least one socket is connected. */
const ACTIVE_POLL_MS = 5_000;
/** Background cadence that keeps the monitoring hub reasonably fresh. */
const IDLE_POLL_MS = 60_000;

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);

  // Caches
  private serverStatusCache: PanelSpeedData[] = [];

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private stopped = false;
  private viewers = 0;

  // Track previous traffic for speed calculation
  private previousTraffic: Record<
    string,
    { up: bigint; down: bigint; time: number }
  > = {};

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly monitoringHub?: UnifiedMonitoringHub,
  ) {}

  onModuleInit() {
    this.logger.log('Starting Monitoring Cache Loops...');
    this.schedulePoll(0);
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  // Getters for WebSocket/Gateway
  public getLatestServerStatus(): PanelSpeedData[] {
    return this.serverStatusCache;
  }

  public hasViewers(): boolean {
    return this.viewers > 0;
  }

  public viewerConnected(): void {
    this.viewers++;
    // Leave idle cadence right away instead of waiting up to a minute.
    if (this.viewers === 1) this.schedulePoll(0);
  }

  public viewerDisconnected(): void {
    this.viewers = Math.max(0, this.viewers - 1);
  }

  private schedulePoll(delayMs: number): void {
    if (this.stopped) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.runPoll(), delayMs);
  }

  private async runPoll(): Promise<void> {
    this.pollTimer = null;
    // An in-flight poll reschedules itself when it finishes.
    if (this.polling) return;
    this.polling = true;
    try {
      await this.pollServerStatus();
    } finally {
      this.polling = false;
      this.schedulePoll(this.viewers > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    }
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
          panelType: true,
        },
      });

      const results = await Promise.all(
        panels.map(async (p) => {
          if (isExternalPanelType(p.panelType)) {
            return null;
          }
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

          const apiBaseUrl = resolvePanelApiBaseUrl(p);
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

      this.serverStatusCache = results.filter((row): row is PanelSpeedData => row != null);
      for (const row of this.serverStatusCache) {
        this.monitoringHub?.ingest({
          panelId: row.panelId,
          source: 'core',
          cpu: row.cpu,
          memory: row.ram,
          onlineUsers: undefined,
          recordedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.logger.error('Failed to poll server status: ' + err.message);
    }
  }
}

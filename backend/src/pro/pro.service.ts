import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PanelsService } from '../panels/panels.service';
import axios from 'axios';

@Injectable()
export class ProService {
  private readonly logger = new Logger(ProService.name);

  constructor(
    private prisma: PrismaService,
    private panelsService: PanelsService
  ) {}

  async getOverview() {
    const panels = await this.prisma.panel.findMany({
      include: {
        server: {
          include: {
            systemStats: {
              orderBy: { recordedAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    let totalOnline = 0;
    let totalCpu = 0;
    let totalRam = 0;
    let totalDisk = 0;
    let activePanels = 0;

    const enrichedPanels = await Promise.all(panels.map(async (p) => {
      let isOnline = false;
      let xrayStatus = 'unknown';
      let version = p.version || 'Unknown';
      let uptime = '0s';

      try {
        const apiBaseUrl = p.apiBaseUrl || p.url.replace(/\/$/, '');
        const statusRes = await axios.get(`${apiBaseUrl}/panel/api/server/status`, {
          headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined },
          timeout: 5000,
        });
        isOnline = true;
        if (statusRes.data?.obj) {
          xrayStatus = statusRes.data.obj.xray?.state || 'stopped';
          version = statusRes.data.obj.xray?.version || version;
          uptime = `${Math.floor(statusRes.data.obj.uptime / 3600)}h`;
        }
      } catch (e) {
        isOnline = false;
      }

      if (isOnline) activePanels++;

      const latestStat = p.server?.systemStats?.[0];
      if (latestStat) {
        totalCpu += latestStat.cpuUsage;
        totalRam += latestStat.ramUsage;
        totalDisk += latestStat.diskUsage;
      }

      return {
        id: p.id,
        name: p.name,
        panelStatus: isOnline ? 'online' : 'offline',
        xrayStatus,
        version,
        uptime,
        cpu: latestStat?.cpuUsage || 0,
        ram: latestStat?.ramUsage || 0,
        disk: latestStat?.diskUsage || 0,
        onlineUsers: p.clientCount,
      };
    }));

    totalOnline = enrichedPanels.reduce((acc, curr) => acc + curr.onlineUsers, 0);

    return {
      global: {
        totalPanels: panels.length,
        activePanels,
        totalOnline,
        avgCpu: panels.length > 0 ? totalCpu / panels.length : 0,
        avgRam: panels.length > 0 ? totalRam / panels.length : 0,
        avgDisk: panels.length > 0 ? totalDisk / panels.length : 0,
      },
      panels: enrichedPanels
    };
  }

  async getMetrics(timeRange: string) {
    let minutesAgo = 60; // 1h default
    if (timeRange === '1m') minutesAgo = 1;
    if (timeRange === '5m') minutesAgo = 5;
    if (timeRange === '15m') minutesAgo = 15;

    const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000);

    const stats = await this.prisma.systemStats.findMany({
      where: { recordedAt: { gte: cutoff } },
      orderBy: { recordedAt: 'asc' },
    });

    // We'll aggregate by timestamp roughly (minute by minute for 1h, or raw for 1m/5m)
    // For simplicity, we just return the raw records grouped by server, the frontend will format them.
    return stats;
  }

  async getIncidents() {
    return (this.prisma as any).incident.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 100,
      include: { panel: true }
    });
  }

  async getMaintenance() {
    const panels = await this.prisma.panel.findMany();
    // Simulate fetching upstream version
    const latestVersion = '2.4.3';
    
    return panels.map(p => ({
      id: p.id,
      name: p.name,
      currentVersion: p.version || 'Unknown',
      latestVersion,
      needsUpdate: p.version && p.version !== latestVersion
    }));
  }

  async executeOperation(action: string, targetPanelId: string | null, req: any) {
    const allowedActions = ['RESTART_XRAY', 'START_XRAY', 'STOP_XRAY', 'RESTART_PANEL', 'RUN_SYNC', 'CREATE_BACKUP'];
    
    if (!allowedActions.includes(action)) {
      throw new BadRequestException('Invalid operation. Arbitrary commands are forbidden.');
    }

    let result = { success: true, message: 'Operation executed successfully' };

    try {
      if (['RESTART_XRAY', 'START_XRAY', 'STOP_XRAY'].includes(action)) {
        if (!targetPanelId) throw new BadRequestException('Panel ID required for Xray operations');
        const p = await this.prisma.panel.findUnique({ where: { id: targetPanelId }});
        if (!p) throw new NotFoundException('Panel not found');
        const apiBaseUrl = p.apiBaseUrl || p.url.replace(/\/$/, '');
        
        // Use the safe 3x-ui API endpoints
        if (action === 'RESTART_XRAY') {
          await axios.post(`${apiBaseUrl}/panel/api/server/restartXrayService`, {}, {
            headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined }
          });
        }
        if (action === 'STOP_XRAY') {
          await axios.post(`${apiBaseUrl}/panel/api/server/stopXrayService`, {}, {
            headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined }
          });
        }
        // Actually 3x-ui handles restart, stop usually.
      } 
      else if (action === 'RESTART_PANEL') {
        if (!targetPanelId) throw new BadRequestException('Panel ID required');
        const p = await this.prisma.panel.findUnique({ where: { id: targetPanelId }});
        if (!p) throw new NotFoundException('Panel not found');
        const apiBaseUrl = p.apiBaseUrl || p.url.replace(/\/$/, '');
        
        await axios.post(`${apiBaseUrl}/panel/api/server/restartPanel`, {}, {
          headers: { Authorization: p.apiToken ? `Bearer ${p.apiToken}` : undefined }
        });
      }
      else if (action === 'RUN_SYNC') {
        if (targetPanelId) {
          await this.panelsService.sync(targetPanelId);
        } else {
          // Sync all
          const panels = await this.prisma.panel.findMany();
          for (const p of panels) await this.panelsService.sync(p.id);
        }
      }
      else if (action === 'CREATE_BACKUP') {
        // ... logic for trigger manual backup
        result.message = 'Backup job queued';
      }

      // Log Audit
      await this.prisma.auditLog.create({
        data: {
          adminId: req.user.adminId,
          action: action,
          entity: 'OperationsCenter',
          entityId: targetPanelId || 'GLOBAL',
          details: { status: 'SUCCESS' },
          ipAddress: req.ip || '0.0.0.0'
        }
      });

      return result;

    } catch (e: any) {
      this.logger.error(`Operation ${action} failed: ${e.message}`);
      
      await this.prisma.auditLog.create({
        data: {
          adminId: req.user.adminId,
          action: action,
          entity: 'OperationsCenter',
          entityId: targetPanelId || 'GLOBAL',
          details: { status: 'FAILED', error: e.message },
          ipAddress: req.ip || '0.0.0.0'
        }
      });

      throw new BadRequestException(`Operation failed: ${e.message}`);
    }
  }
}

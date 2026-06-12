import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PanelsService } from '../panels/panels.service';
import * as os from 'os';
import * as fs from 'fs';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

@Injectable()
export class StatsService {
  constructor(
    private prisma: PrismaService,
    private panelsService: PanelsService,
  ) {}

  /** Super-admin KPI cards. */
  async overview() {
    const now = Date.now();
    const startToday = new Date(new Date().setHours(0, 0, 0, 0));
    const startMonth = new Date();
    startMonth.setDate(1);
    startMonth.setHours(0, 0, 0, 0);

    const [
      panelsTotal, panelsOnline,
      adminsTotal, adminsActive, adminsSuspended,
      clientsTotal, clientsEnabled, clientsExpired,
      trafficSold, trafficActualUsed, totalAdminBalance, thresholdSetting
    ] = await Promise.all([
      this.prisma.panel.count(),
      this.prisma.panel.count({ where: { status: 'online' } }),
      this.prisma.admin.count(),
      this.prisma.admin.count({ where: { status: 'active' } }),
      this.prisma.admin.count({ where: { status: 'suspended' } }),
      this.prisma.panel.aggregate({ _sum: { clientCount: true } }),
      this.prisma.client.count({ where: { enable: true, adminId: { not: null } } }),
      this.prisma.client.count({ where: { expiryTime: { gt: 0n, lt: BigInt(now) }, adminId: { not: null } } }),
      // Total traffic ever sold/credited to admins
      this.prisma.trafficTransaction.aggregate({ _sum: { amount: true }, where: { type: 'CREDIT' } }),
      // Actual usage charged (USAGE_CHARGE) — reliable even after migration
      this.prisma.trafficTransaction.aggregate({ _sum: { amount: true }, where: { type: 'USAGE_CHARGE' } }),
      // Sum of current admin balances (= allocated - deducted)
      this.prisma.admin.aggregate({ _sum: { balance: true } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'cleanup_threshold_days' } }),
    ]);

    const thresholdDays = thresholdSetting ? Number(thresholdSetting.value.replace(/"/g, '')) || 30 : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    
    const cleanupCandidates = await this.prisma.client.count({ 
      where: { expiryTime: { gt: 0n, lt: BigInt(now - thresholdMs) }, adminId: { not: null } } 
    });

    // Remaining = sum of all admin balances (most accurate: reflects all deductions/refunds)
    const remaining = BigInt(Math.round(Math.max(0, totalAdminBalance._sum.balance ?? 0)));
    // Total assigned = sum of all CREDIT transactions ever
    const trafficSoldTotal = trafficSold._sum.amount ?? 0n;
    // Actual usage from USAGE_CHARGE transactions (for USAGE mode admins)
    const trafficUsedFromTx = trafficActualUsed._sum.amount ?? 0n;
    // For display: use the allocated-remaining as "used" (covers both ALLOCATION and USAGE modes)
    const trafficUsed = trafficSoldTotal > remaining ? trafficSoldTotal - remaining : 0n;

    let todayUsage = 0n;
    let monthlyUsage = 0n;
    
    // Analyze SystemStats to compute true network usage
    const systemStats = await this.prisma.systemStats.findMany({
      where: { recordedAt: { gte: startMonth } },
      orderBy: { recordedAt: 'asc' },
      select: { serverId: true, netUp: true, netDown: true, recordedAt: true }
    });

    for (const stat of systemStats) {
      const delta = stat.netUp + stat.netDown;
      
      monthlyUsage += delta;
      if (stat.recordedAt >= startToday) {
        todayUsage += delta;
      }
    }

    return {
      panels: { total: panelsTotal, online: panelsOnline, offline: panelsTotal - panelsOnline },
      admins: { total: adminsTotal, active: adminsActive, suspended: adminsSuspended },
      clients: { total: clientsTotal._sum?.clientCount ?? 0, active: clientsEnabled, expired: clientsExpired, cleanupCandidates },
      usage: {
        today: todayUsage.toString(),
        monthly: monthlyUsage.toString(),
      },
      traffic: {
        sold: trafficSoldTotal,
        used: trafficUsed,
        remaining,
      },
    };
  }

  async resellerOverview(adminId: string, panelId?: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { balance: true, maxClients: true, expiryTime: true, totalAssigned: true, trafficMode: true, gracePeriodStart: true }
    });

    if (!admin) throw new Error('Admin not found');

    const whereClause: any = { adminId };
    if (panelId) {
      whereClause.inbounds = {
        some: {
          inbound: { panelId }
        }
      };
    }

    const clients = await this.prisma.client.findMany({
      where: whereClause,
      select: { id: true, email: true, remark: true, up: true, down: true, total: true, expiryTime: true, enable: true }
    });

    const thresholdSetting = await this.prisma.systemSetting.findUnique({ where: { key: 'cleanup_threshold_days' } });
    const thresholdDays = thresholdSetting ? Number(thresholdSetting.value.replace(/"/g, '')) || 30 : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

    let todayUsage = 0n;
    let monthlyUsage = 0n;
    
    const startToday = new Date(new Date().setHours(0, 0, 0, 0));
    const startMonth = new Date();
    startMonth.setDate(1);
    startMonth.setHours(0, 0, 0, 0);

    const transactions = await this.prisma.trafficTransaction.findMany({
      where: { 
        type: 'USAGE_CHARGE',
        createdAt: { gte: startMonth },
        client: { adminId }
      },
      select: { amount: true, createdAt: true }
    });

    for (const t of transactions) {
      monthlyUsage += t.amount;
      if (t.createdAt >= startToday) {
        todayUsage += t.amount;
      }
    }

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    let trafficLowCount = 0;
    let expiringSoonCount = 0;
    let disabledCount = 0;
    let depletedCount = 0;
    let cleanupCandidatesCount = 0;
    let totalUsedTraffic = 0;

    const attentionClients = [];

    for (const c of clients) {
      const used = Number(c.up) + Number(c.down);
      totalUsedTraffic += used;
      const total = Number(c.total);
      const isDepleted = total > 0 && used >= total;
      const isTrafficLow = total > 0 && !isDepleted && (used / total) >= 0.8;
      const isExpiringSoon = c.expiryTime > 0n && c.expiryTime > BigInt(now) && c.expiryTime <= BigInt(now + SEVEN_DAYS);
      const isExpired = c.expiryTime > 0n && c.expiryTime <= BigInt(now);
      const isCleanupCandidate = c.expiryTime > 0n && c.expiryTime <= BigInt(now - thresholdMs);
      const isDisabled = !c.enable;

      if (isDepleted) depletedCount++;
      if (isDisabled) disabledCount++;
      if (isTrafficLow) trafficLowCount++;
      if (isExpiringSoon) expiringSoonCount++;
      if (isCleanupCandidate) cleanupCandidatesCount++;

      if (isDepleted || isDisabled || isTrafficLow || isExpiringSoon || isExpired) {
        attentionClients.push({
          id: c.id,
          email: c.email,
          remark: c.remark,
          used,
          total,
          expiryTime: Number(c.expiryTime),
          enable: c.enable,
          reasons: {
            depleted: isDepleted,
            disabled: isDisabled,
            trafficLow: isTrafficLow,
            expiringSoon: isExpiringSoon,
            expired: isExpired,
          }
        });
      }
    }

    // Sort priority
    attentionClients.sort((a, b) => {
      // depleted / expired > trafficLow > expiringSoon > disabled
      const score = (c: any) => {
        let s = 0;
        if (c.reasons.depleted || c.reasons.expired) s += 100;
        if (c.reasons.trafficLow) s += 50;
        if (c.reasons.expiringSoon) s += 25;
        if (c.reasons.disabled) s += 10;
        return s;
      };
      return score(b) - score(a);
    });

    return {
      admin: {
        availableTraffic: admin.balance,
        allTimeTraffic: admin.totalAssigned,
        clientCapacity: admin.maxClients,
        expiryTime: Number(admin.expiryTime),
        trafficMode: admin.trafficMode,
        usedTraffic: totalUsedTraffic,
        gracePeriodStart: admin.gracePeriodStart,
      },
      usage: {
        today: todayUsage.toString(),
        monthly: monthlyUsage.toString(),
      },
      attention: {
        trafficLow: trafficLowCount,
        expiringSoon: expiringSoonCount,
        disabled: disabledCount,
        depleted: depletedCount,
        cleanupCandidates: cleanupCandidatesCount,
      },
      priorityClients: attentionClients.slice(0, 5),
      clientEmails: clients.map(c => c.email)
    };
  }

  /** Traffic volume time-series over a window, bucketed for charting. */
  async trafficSeries(range: '24h' | '7d' | '30d') {
    const now = Date.now();
    const cfg = {
      '24h': { since: now - DAY, bucket: HOUR, fmt: (d: Date) => `${d.getHours()}:00` },
      '7d': { since: now - 7 * DAY, bucket: DAY, fmt: (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' }) },
      '30d': { since: now - 30 * DAY, bucket: DAY, fmt: (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) },
    }[range] ?? { since: now - DAY, bucket: HOUR, fmt: (d: Date) => `${d.getHours()}:00` };

    const rows = await this.prisma.systemStats.findMany({
      where: { recordedAt: { gte: new Date(cfg.since) } },
      select: { netUp: true, netDown: true, recordedAt: true },
      orderBy: { recordedAt: 'asc' },
    });

    const buckets = new Map<number, number>();
    for (const r of rows) {
      const key = Math.floor(r.recordedAt.getTime() / cfg.bucket) * cfg.bucket;
      const bytes = Number(r.netUp) + Number(r.netDown);
      buckets.set(key, (buckets.get(key) ?? 0) + bytes);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, bytes]) => ({ label: cfg.fmt(new Date(k)), bytes }));
  }

  /** Trend datasets for the dashboard charts. */
  async trends() {
    const since = new Date(Date.now() - 30 * DAY);

    const clients = await this.prisma.client.findMany({
      where: { adminId: { not: null } },
      select: {
        up: true, down: true, createdAt: true,
        admin: { select: { username: true } },
        inbounds: {
          select: {
            inbound: {
              select: {
                tag: true,
                panel: { select: { name: true } }
              }
            }
          }
        },
      },
    });

    const mappedClients = clients.map(c => ({
      ...c,
      inbound: c.inbounds?.[0]?.inbound || null
    }));

    // New clients per day (last 30d)
    const byDay = new Map<string, number>();
    for (const c of mappedClients) {
      if (c.createdAt < since) continue;
      const key = c.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const newClients = [...byDay.entries()].sort().map(([date, count]) => ({
      date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count,
    }));

    const agg = (keyFn: (c: (typeof mappedClients)[number]) => string) => {
      const m = new Map<string, number>();
      for (const c of mappedClients) {
        const used = Number(c.up) + Number(c.down);
        m.set(keyFn(c), (m.get(keyFn(c)) ?? 0) + used);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, bytes]) => ({ name, bytes }));
    };

    return {
      newClients,
      byAdmin: agg((c) => c.admin?.username || 'Unassigned'),
      byInbound: agg((c) => c.inbound?.tag || 'Unknown'),
      byPanel: agg((c) => c.inbound?.panel?.name || 'Unknown'),
    };
  }

  /** Live monitoring snapshot (host metrics are simulated for the demo). */
  async monitoring() {
    const servers = await this.prisma.server.findMany({ select: { id: true, name: true } });
    const serverStats = await Promise.all(
      servers.map(async (s) => {
        const latest = await this.prisma.systemStats.findFirst({
          where: { serverId: s.id },
          orderBy: { recordedAt: 'desc' },
        });
        return {
          server: s.name,
          cpu: latest?.cpuUsage ?? 0,
          ram: latest?.ramUsage ?? 0,
          disk: latest?.diskUsage ?? 0,
          netUp: latest?.netUp ?? 0n,
          netDown: latest?.netDown ?? 0n,
          recordedAt: latest?.recordedAt ?? null,
        };
      }),
    );

    const panels = await this.prisma.panel.findMany({ select: { name: true, status: true } });
    const [lastSync, failedJobs] = await Promise.all([
      this.prisma.syncState.findFirst({ orderBy: { lastSync: 'desc' }, select: { lastSync: true } }),
      this.prisma.syncState.count({ where: { status: 'failure' } }),
    ]);

    return {
      servers: serverStats,
      xray: panels.map((p) => ({ panel: p.name, status: p.status === 'online' ? 'running' : 'stopped' })),
      lastSync: lastSync?.lastSync ?? null,
      pendingJobs: 0,
      failedJobs,
    };
  }

  /** Quick action: run a real sync across all panels. */
  async runSync() {
    const panels = await this.prisma.panel.findMany({ select: { id: true } });
    let synced = 0;
    for (const p of panels) {
      try {
        await this.panelsService.sync(p.id);
        synced++;
      } catch (err) {
        console.error(`Sync failed for panel ${p.id}:`, err);
      }
    }
    return { synced };
  }

  /** Quick action: restart Xray across all online panels. */
  async restartXray() {
    const panels = await this.prisma.panel.findMany({ where: { status: 'online' }, select: { id: true } });
    let restarted = 0;
    for (const p of panels) {
      try {
        await this.panelsService.restartXray(p.id);
        restarted++;
      } catch (err) {
        console.error(`Restart failed for panel ${p.id}:`, err);
      }
    }
    return { restarted, message: `Xray restart issued on ${restarted} online panel(s)` };
  }

  /** Quick action: simulate creating a manual backup. */
  async createBackup() {
    return this.prisma.backup.create({
      data: {
        type: 'postgres',
        filePath: `/backups/pg/manual-${Date.now()}.sql.gz`,
        fileSize: BigInt(Math.round(1.1 * 1024 ** 3)),
        checksum: `sha256:${Math.random().toString(16).slice(2, 10)}`,
        tier: 'hourly',
        isManual: true,
        status: 'completed',
      },
    });
  }

  /** Real-time system diagnostics without any mock data. */
  async getDiagnostics() {
    const diagnostics = {
      database: { status: 'offline', latencyMs: 0 },
      redis: { status: 'offline', latencyMs: 0 },
      panels: [] as any[],
      stats: {
        connectedPanels: 0,
        importedInbounds: 0,
        importedClients: 0,
      }
    };

    // 1. Check Database (PostgreSQL)
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      diagnostics.database.status = 'online';
      diagnostics.database.latencyMs = Date.now() - dbStart;
    } catch (err) {
      diagnostics.database.status = 'offline';
    }

    // 2. Check Redis (Bull/ioredis dependency check)
    const redisStart = Date.now();
    try {
      const Redis = require('ioredis');
      const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1, connectTimeout: 2000 });
      await redis.ping();
      diagnostics.redis.status = 'online';
      diagnostics.redis.latencyMs = Date.now() - redisStart;
      redis.disconnect();
    } catch (err) {
      diagnostics.redis.status = 'offline';
    }

    // 3. Fetch Real Stats
    const panels = await this.prisma.panel.findMany({
      select: {
        id: true,
        name: true,
        version: true,
        status: true,
        inboundCount: true,
        clientCount: true,
        syncState: {
          select: {
            lastSync: true,
            latencyMs: true,
            status: true,
            errorLogs: true,
          }
        }
      }
    });

    diagnostics.panels = panels.map(p => ({
      name: p.name,
      version: p.version || 'unknown',
      status: p.status,
      lastSync: p.syncState?.lastSync || null,
      lastLatency: p.syncState?.latencyMs || 0,
      syncResult: p.syncState?.status || 'unknown',
      errorLogs: p.syncState?.errorLogs || null,
    }));

    diagnostics.stats.connectedPanels = panels.filter(p => p.status === 'online').length;
    diagnostics.stats.importedInbounds = await this.prisma.inbound.count();
    diagnostics.stats.importedClients = await this.prisma.client.count();

    return diagnostics;
  }

  /** Live CPU, RAM, and Disk usage of the host machine running the panel */
  async systemResources() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramUsagePercent = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;

    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (const cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice;
      sys += cpu.times.sys;
      idle += cpu.times.idle;
      irq += cpu.times.irq;
    }
    const total = user + nice + sys + idle + irq;
    const active = total - idle;
    const cpuUsagePercent = total > 0 ? (active / total) * 100 : 0;

    let diskUsagePercent = 0;
    let totalDisk = 0;
    let usedDisk = 0;
    try {
      // In Node 19.6.0+, statfsSync returns filesystem stats
      const statfs = fs.statfsSync('/');
      totalDisk = statfs.blocks * statfs.bsize;
      const freeDisk = statfs.bfree * statfs.bsize;
      usedDisk = totalDisk - freeDisk;
      diskUsagePercent = totalDisk > 0 ? (usedDisk / totalDisk) * 100 : 0;
    } catch (e) {
      // Ignore fallback
    }

    return {
      cpu: cpuUsagePercent,
      ram: ramUsagePercent,
      disk: diskUsagePercent,
      totalMem,
      usedMem,
      totalDisk,
      usedDisk,
    };
  }
}

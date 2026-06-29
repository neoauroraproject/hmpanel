import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PanelsService } from '../panels/panels.service';
import { ClientsService } from '../clients/clients.service';
import axios from 'axios';

/**
 * BulkClientsService — Dedicated service for optimized bulk operations.
 *
 * Uses 3.4.2 bulk API endpoints when available, with automatic fallback
 * to sequential operations for 3.3.1 panels. Does NOT modify any existing
 * provisioning, sync, update, or delete workflows.
 */
@Injectable()
export class BulkClientsService {
  private readonly logger = new Logger(BulkClientsService.name);

  constructor(
    private prisma: PrismaService,
    private panelsService: PanelsService,
    private clientsService: ClientsService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Build subscription URL for a client, reusing the same logic as
   * ClientsService.getQrCode().
   */
  private buildSubUrl(
    subUrlBase: string,
    subIdOrEmail: string,
  ): string {
    try {
      const pUrl = new URL(subUrlBase);
      const pathname = pUrl.pathname.endsWith('/sub/')
        ? pUrl.pathname
        : `${pUrl.pathname.replace(/\/$/, '')}/sub/`;
      return `${pUrl.origin}${pathname}${encodeURIComponent(subIdOrEmail)}`;
    } catch {
      const base = subUrlBase.endsWith('/') ? subUrlBase : `${subUrlBase}/`;
      if (base.includes('/sub/')) {
        return `${base}${encodeURIComponent(subIdOrEmail)}`;
      }
      return `${base}sub/${encodeURIComponent(subIdOrEmail)}`;
    }
  }

  /**
   * Load clients and group them by panelId. Returns the client records
   * and a map of panelId → emails[].
   */
  private async loadAndGroupClients(
    adminId: string,
    role: string,
    clientIds: string[],
  ) {
    const scope: Prisma.ClientWhereInput = { id: { in: clientIds } };
    if (role !== 'SUPER_ADMIN') scope.adminId = adminId;

    const clients = await this.prisma.client.findMany({
      where: scope,
      select: {
        id: true,
        email: true,
        enable: true,
        subId: true,
        panelId: true,
        inbounds: {
          select: {
            inbound: {
              select: {
                panel: {
                  select: {
                    id: true,
                    name: true,
                    url: true,
                    subUrl: true,
                    apiBaseUrl: true,
                    apiToken: true,
                    capBulkEnable: true,
                    capBulkDisable: true,
                    capBulkExport: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Group by panelId
    const byPanel = new Map<
      string,
      {
        panel: {
          id: string;
          name: string;
          url: string;
          subUrl: string | null;
          apiBaseUrl: string | null;
          apiToken: string | null;
          capBulkEnable: boolean;
          capBulkDisable: boolean;
          capBulkExport: boolean;
        };
        emails: string[];
        clientRecords: typeof clients;
      }
    >();

    for (const c of clients) {
      const panel = c.inbounds?.[0]?.inbound?.panel;
      if (!panel) continue;

      if (!byPanel.has(panel.id)) {
        byPanel.set(panel.id, { panel, emails: [], clientRecords: [] });
      }
      const group = byPanel.get(panel.id)!;
      if (!group.emails.includes(c.email)) {
        group.emails.push(c.email);
      }
      group.clientRecords.push(c);
    }

    return { clients, byPanel };
  }

  /**
   * Call a 3.4.2 bulk endpoint on a panel.
   */
  private async callBulkEndpoint(
    panel: { apiBaseUrl: string | null; url: string; apiToken: string | null },
    endpoint: string,
    body: any,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const base = panel.apiBaseUrl || panel.url.replace(/\/$/, '');
    const headers: Record<string, string> = {};
    if (panel.apiToken) {
      headers['Authorization'] = `Bearer ${panel.apiToken}`;
    }

    try {
      const res = await axios.post(`${base}${endpoint}`, body, {
        headers,
        timeout: 30_000,
      });
      if (res.data && res.data.success) {
        return { success: true, data: res.data.obj };
      }
      return { success: false, error: res.data?.msg || 'Unknown panel error' };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.msg || err.message || 'Network error',
      };
    }
  }

  // ─── Bulk Enable ─────────────────────────────────────────────────────────────

  async bulkEnable(adminId: string, role: string, clientIds: string[]) {
    if (!clientIds?.length) throw new BadRequestException('No clients selected');

    const { clients, byPanel } = await this.loadAndGroupClients(adminId, role, clientIds);
    if (!clients.length) return { affected: 0 };

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const [panelId, { panel, emails }] of byPanel) {
      if (panel.capBulkEnable) {
        // ── 3.4.2 optimized path: single bulk request ──
        this.logger.log(`[BULK_ENABLE] Using 3.4.2 bulkEnable for panel ${panel.name} (${emails.length} clients)`);

        const result = await this.callBulkEndpoint(panel, '/panel/api/clients/bulkEnable', { emails });

        if (result.success) {
          const changed = result.data?.changed ?? emails.length;
          const skipped = result.data?.skipped ?? [];
          results.success += changed;
          results.failed += skipped.length;
          for (const s of skipped) {
            results.errors.push(`${s.email}: ${s.reason}`);
          }
        } else {
          // Bulk endpoint failed — fall back to sequential for this panel
          this.logger.warn(`[BULK_ENABLE] 3.4.2 bulkEnable failed for panel ${panel.name}: ${result.error}. Falling back to sequential.`);
          await this.sequentialToggle(adminId, role, clients.filter(c => c.inbounds?.[0]?.inbound?.panel?.id === panelId), 'enable', results);
        }
      } else {
        // ── 3.3.1 fallback: sequential ──
        this.logger.log(`[BULK_ENABLE] Panel ${panel.name} does not support bulkEnable, using sequential fallback`);
        await this.sequentialToggle(adminId, role, clients.filter(c => c.inbounds?.[0]?.inbound?.panel?.id === panelId), 'enable', results);
      }
    }

    // Update local DB state for successfully enabled clients
    if (results.success > 0) {
      const enabledEmails = clients
        .filter(c => !results.errors.some(e => e.startsWith(c.email + ':')))
        .map(c => c.id);

      if (enabledEmails.length > 0) {
        await this.prisma.client.updateMany({
          where: { id: { in: enabledEmails } },
          data: { enable: true, disableReason: null },
        });
      }
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'BULK_ENABLE',
        entity: 'Client',
        adminId,
        details: {
          count: clients.length,
          success: results.success,
          failed: results.failed,
          errors: results.errors,
          optimized: [...byPanel.values()].some(g => g.panel.capBulkEnable),
        },
      },
    });

    if (results.failed > 0) {
      return { affected: results.success, failed: results.failed, errors: results.errors };
    }
    return { affected: results.success };
  }

  // ─── Bulk Disable ────────────────────────────────────────────────────────────

  async bulkDisable(adminId: string, role: string, clientIds: string[]) {
    if (!clientIds?.length) throw new BadRequestException('No clients selected');

    const { clients, byPanel } = await this.loadAndGroupClients(adminId, role, clientIds);
    if (!clients.length) return { affected: 0 };

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const [panelId, { panel, emails }] of byPanel) {
      if (panel.capBulkDisable) {
        // ── 3.4.2 optimized path ──
        this.logger.log(`[BULK_DISABLE] Using 3.4.2 bulkDisable for panel ${panel.name} (${emails.length} clients)`);

        const result = await this.callBulkEndpoint(panel, '/panel/api/clients/bulkDisable', { emails });

        if (result.success) {
          const changed = result.data?.changed ?? emails.length;
          const skipped = result.data?.skipped ?? [];
          results.success += changed;
          results.failed += skipped.length;
          for (const s of skipped) {
            results.errors.push(`${s.email}: ${s.reason}`);
          }
        } else {
          this.logger.warn(`[BULK_DISABLE] 3.4.2 bulkDisable failed for panel ${panel.name}: ${result.error}. Falling back to sequential.`);
          await this.sequentialToggle(adminId, role, clients.filter(c => c.inbounds?.[0]?.inbound?.panel?.id === panelId), 'disable', results);
        }
      } else {
        // ── 3.3.1 fallback ──
        this.logger.log(`[BULK_DISABLE] Panel ${panel.name} does not support bulkDisable, using sequential fallback`);
        await this.sequentialToggle(adminId, role, clients.filter(c => c.inbounds?.[0]?.inbound?.panel?.id === panelId), 'disable', results);
      }
    }

    // Update local DB
    if (results.success > 0) {
      const disabledEmails = clients
        .filter(c => !results.errors.some(e => e.startsWith(c.email + ':')))
        .map(c => c.id);

      if (disabledEmails.length > 0) {
        await this.prisma.client.updateMany({
          where: { id: { in: disabledEmails } },
          data: { enable: false, disableReason: 'MANUAL' },
        });
      }
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'BULK_DISABLE',
        entity: 'Client',
        adminId,
        details: {
          count: clients.length,
          success: results.success,
          failed: results.failed,
          errors: results.errors,
          optimized: [...byPanel.values()].some(g => g.panel.capBulkDisable),
        },
      },
    });

    if (results.failed > 0) {
      return { affected: results.success, failed: results.failed, errors: results.errors };
    }
    return { affected: results.success };
  }

  // ─── Sequential Fallback ────────────────────────────────────────────────────

  private async sequentialToggle(
    adminId: string,
    role: string,
    clients: { id: string; email: string }[],
    action: 'enable' | 'disable',
    results: { success: number; failed: number; errors: string[] },
  ) {
    // Delegate to existing ClientsService.bulk() which handles per-client
    // updates with full panel sync + atomic operations
    try {
      const response = await this.clientsService.bulk(adminId, role, {
        ids: clients.map(c => c.id),
        action,
      });
      results.success += response.affected ?? 0;
      if (response.failed) {
        results.failed += response.failed;
        results.errors.push(...(response.errors || []));
      }
    } catch (err: any) {
      results.failed += clients.length;
      results.errors.push(`Sequential fallback error: ${err.message}`);
    }
  }

  // ─── Export Subscription Links ──────────────────────────────────────────────

  async exportSubscriptionLinks(adminId: string, role: string, clientIds: string[]) {
    if (!clientIds?.length) throw new BadRequestException('No clients selected');

    const scope: Prisma.ClientWhereInput = { id: { in: clientIds } };
    if (role !== 'SUPER_ADMIN') scope.adminId = adminId;

    const clients = await this.prisma.client.findMany({
      where: scope,
      select: {
        id: true,
        email: true,
        subId: true,
        enable: true,
        inbounds: {
          select: {
            inbound: {
              select: {
                panel: {
                  select: { id: true, name: true, url: true, subUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { email: 'asc' },
    });

    if (!clients.length) throw new BadRequestException('No clients found');

    const lines: string[] = [];

    for (const c of clients) {
      const panel = c.inbounds?.[0]?.inbound?.panel;
      if (!panel) {
        lines.push(c.email);
        lines.push('(no panel assigned)');
        lines.push('');
        continue;
      }

      const subUrlBase = panel.subUrl || panel.url || 'http://localhost';
      const subUrl = this.buildSubUrl(subUrlBase, c.subId || c.email);

      lines.push(c.email);
      lines.push(subUrl);
      lines.push('');
    }

    // Remove trailing blank line
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `subscriptions-${dateStr}.txt`;

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'BULK_EXPORT_SUBS',
        entity: 'Client',
        adminId,
        details: { count: clients.length, filename },
      },
    });

    return {
      filename,
      content: lines.join('\n'),
      count: clients.length,
    };
  }
}

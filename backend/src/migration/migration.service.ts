import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PanelsService } from '../panels/panels.service';
import { derivePanelConnectionFromUrl } from '../common/utils/panel-url.util';
import Database = require('better-sqlite3');
import { randomUUID } from 'crypto';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);
  private currentBackupPath: string | null = null;
  private sanaeiUsersCache: any[] = [];

  constructor(
    private prisma: PrismaService,
    private panelsService: PanelsService,
  ) {}

  async validateBackup(filePath: string) {
    try {
      const db = new Database(filePath, { fileMustExist: true });
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as any[];
      const tableNames = tables.map((t) => t.name);

      if (
        !tableNames.includes('panels') ||
        !tableNames.includes('admins') ||
        !tableNames.includes('sanaei_users')
      ) {
        db.close();
        throw new BadRequestException(
          'Invalid database schema. Missing required tables.',
        );
      }

      this.currentBackupPath = filePath;
      db.close();

      return {
        valid: true,
        message: 'Database validated successfully',
        path: filePath,
      };
    } catch (error: any) {
      this.logger.error('Database validation failed', error);
      throw new BadRequestException(`Validation failed: ${error.message}`);
    }
  }

  async preview() {
    if (!this.currentBackupPath)
      throw new BadRequestException('No backup uploaded');
    const db = new Database(this.currentBackupPath, { fileMustExist: true });

    try {
      const panelsCount = (
        db.prepare('SELECT COUNT(*) as count FROM panels').get() as any
      ).count;
      const adminsCount = (
        db.prepare('SELECT COUNT(*) as count FROM admins').get() as any
      ).count;
      const usersCount = (
        db.prepare('SELECT COUNT(*) as count FROM sanaei_users').get() as any
      ).count;

      return {
        panels: panelsCount,
        admins: adminsCount,
        users: usersCount,
      };
    } finally {
      db.close();
    }
  }

  async importData() {
    if (!this.currentBackupPath)
      throw new BadRequestException('No backup uploaded');
    const db = new Database(this.currentBackupPath, { fileMustExist: true });

    // Begin our Prisma transaction manually since we are inserting multiple distinct domains
    // Actually, due to the complexity and needed fallbacks, we will insert them sequentially but wrap in error handling
    let importedPanels = 0;
    let importedAdmins = 0;

    try {
      // 1. Fetch Default Server
      let defaultServer = await this.prisma.server.findFirst();
      if (!defaultServer) {
        defaultServer = await this.prisma.server.create({
          data: { name: 'Default Server', ipAddress: '127.0.0.1' },
        });
      }

      // 2. Import Panels
      const panels = db.prepare('SELECT * FROM panels').all() as any[];
      for (const p of panels) {
        // Parse url to get webBasePath and apiBaseUrl first so they are available for both create/update
        let webBasePath = '';
        let apiBaseUrl = String(p.url || '').replace(/\/$/, '');
        let normalizedUrl = apiBaseUrl;
        try {
          const derived = derivePanelConnectionFromUrl(p.url);
          webBasePath = derived.webBasePath;
          apiBaseUrl = derived.apiBaseUrl;
          normalizedUrl = derived.normalizedUrl;
        } catch (err) {
          this.logger.warn(
            `Failed to parse URL for panel ${p.name}: ${p.url}. Using raw URL.`,
          );
        }

        const existing = await this.prisma.panel.findFirst({
          where: { name: p.name },
        });
        if (existing) {
          // Update existing panel to apply correct URLs/tokens
          await this.prisma.panel.update({
            where: { id: existing.id },
            data: {
              url: normalizedUrl,
              subUrl: p.sub_url || null,
              apiToken: p.token || null,
              username: p.username,
              password: p.password,
              status: p.is_active ? 'online' : 'offline',
              panelType: p.panel_type || '3x-ui',
              webBasePath: webBasePath,
              apiBaseUrl: apiBaseUrl,
            },
          });
          this.logger.log(`Updated existing panel: ${p.name}`);
        } else {
          // Create new
          await this.prisma.panel.create({
            data: {
              serverId: defaultServer.id,
              name: p.name,
              url: normalizedUrl,
              subUrl: p.sub_url || null,
              apiToken: p.token || null,
              username: p.username,
              password: p.password,
              status: p.is_active ? 'online' : 'offline',
              panelType: p.panel_type || '3x-ui',
              webBasePath: webBasePath,
              apiBaseUrl: apiBaseUrl,
            },
          });
          importedPanels++;
        }
      }

      // 3. Import Admins
      const admins = db.prepare('SELECT * FROM admins').all() as any[];
      for (const a of admins) {
        let admin = await this.prisma.admin.findUnique({
          where: { username: a.username },
        });

        // Calculate balance from legacy data
        // a.traffic = total allocated bytes, a.remaining_traffic = bytes left
        const totalTraffic = a.traffic ? BigInt(a.traffic) : 0n;
        const remainingTraffic =
          a.remaining_traffic != null
            ? BigInt(a.remaining_traffic)
            : totalTraffic;
        const balanceBytes = remainingTraffic; // balance = what they have left

        if (!admin) {
          admin = await this.prisma.admin.create({
            data: {
              username: a.username,
              email: `${a.username}@migration.local`,
              passwordHash: a.hashed_password,
              role: 'RESELLER',
              status: a.is_active ? 'active' : 'disabled',
              expiryTime: a.expiry_date
                ? BigInt(new Date(a.expiry_date).getTime())
                : 0n,
              // Set balance from migration data
              balance: Number(balanceBytes),
              trafficMode: 'ALLOCATION', // Default for migrated admins
            },
          });
          importedAdmins++;

          // Create a trafficTransaction record for the total allocation (for dashboard tracking)
          if (totalTraffic > 0n) {
            await this.prisma.trafficTransaction
              .create({
                data: {
                  adminId: admin.id,
                  amount: totalTraffic,
                  type: 'CREDIT',
                  action: 'MIGRATION_INITIAL_ALLOCATION',
                  description: 'Migration Import — Initial Allocation',
                  balanceBefore: 0,
                  balanceAfter: Number(balanceBytes),
                },
              })
              .catch(() => {});
          }
        } else {
          // Update existing admin balance from migration data if not already set
          if (admin.balance === 0 && balanceBytes > 0n) {
            await this.prisma.admin.update({
              where: { id: admin.id },
              data: { balance: Number(balanceBytes) },
            });
          }
        }

        // Legacy: also create trafficPool if schema requires it
        if (a.traffic && a.traffic > 0) {
          const poolBytes = BigInt(a.traffic);
          const existingPool = await this.prisma.trafficPool.findFirst({
            where: { adminId: admin.id },
          });
          if (!existingPool) {
            await this.prisma.trafficPool
              .create({
                data: {
                  adminId: admin.id,
                  totalLimit: poolBytes,
                },
              })
              .catch(() => {});
          }
        }
      }

      // 4. Cache sanaei_users for mapping during the sync phase
      this.sanaeiUsersCache = db.prepare('SELECT * FROM sanaei_users').all();

      return {
        success: true,
        importedPanels,
        importedAdmins,
        legacyClientsToMap: this.sanaeiUsersCache.length,
      };
    } catch (e: any) {
      this.logger.error('Migration import failed', e);
      throw new BadRequestException(`Import failed: ${e.message}`);
    } finally {
      db.close();
    }
  }

  async runPostImportSync(createGroups: boolean = true) {
    const panels = await this.prisma.panel.findMany();
    const reports = [];

    let totalSyncedClients = 0;
    let matchedOwnerships = 0;
    let missingOwnerships = 0;
    let groupsCreated = 0;
    let clientsAssignedToGroups = 0;
    let failedAssignments = 0;

    for (const panel of panels) {
      try {
        const syncResult = await this.panelsService.sync(panel.id);
        reports.push({ panelName: panel.name, ...syncResult });

        if (syncResult.success) {
          totalSyncedClients += syncResult.syncedClients;
        }
      } catch (err: any) {
        reports.push({
          panelName: panel.name,
          success: false,
          error: err.message,
        });
      }
    }

    // Apply sanaei_users ownership mapping
    for (const legacyUser of this.sanaeiUsersCache) {
      const client = await this.prisma.client.findFirst({
        where: { email: legacyUser.username },
        include: { inbounds: true },
      });
      const admin = await this.prisma.admin.findUnique({
        where: { username: legacyUser.owner },
      });

      if (client && admin) {
        await this.prisma.client.update({
          where: { id: client.id },
          data: { adminId: admin.id, ownerTag: 'Whale Migration' },
        });
        matchedOwnerships++;

        // Auto-assign adminInbound if not already set, using the client's inbounds
        if (client.inbounds && client.inbounds.length > 0) {
          for (const ci of client.inbounds) {
            const existingAdminInbound =
              await this.prisma.adminInbound.findFirst({
                where: { adminId: admin.id, inboundId: ci.inboundId },
              });
            if (!existingAdminInbound) {
              await this.prisma.adminInbound
                .create({
                  data: { adminId: admin.id, inboundId: ci.inboundId },
                })
                .catch(() => {
                  /* skip duplicates */
                });
            }
          }
        }
      } else {
        missingOwnerships++;
      }
    }

    // Also try to set adminInbound from sanaei_users inbound_id if present
    // This covers the case where admins have inbound_id set in the legacy database
    const adminsWithInboundId = this.sanaeiUsersCache.filter(
      (u) => u.inbound_id,
    );
    for (const legacyUser of adminsWithInboundId) {
      const admin = await this.prisma.admin.findUnique({
        where: { username: legacyUser.owner || legacyUser.username },
      });
      if (!admin) continue;

      // Find inbound by matching the port/tag from legacy inbound_id
      const inbound = await this.prisma.inbound.findFirst({
        where: { port: Number(legacyUser.inbound_id) || undefined },
      });
      if (inbound) {
        const existingAdminInbound = await this.prisma.adminInbound.findFirst({
          where: { adminId: admin.id, inboundId: inbound.id },
        });
        if (!existingAdminInbound) {
          await this.prisma.adminInbound
            .create({
              data: { adminId: admin.id, inboundId: inbound.id },
            })
            .catch(() => {});
        }
      }
    }

    // --- Bulk Group Creation ---
    if (createGroups && this.sanaeiUsersCache.length > 0) {
      const groupAssignments: Record<string, string[]> = {};
      for (const legacyUser of this.sanaeiUsersCache) {
        if (legacyUser.owner && legacyUser.username) {
          if (!groupAssignments[legacyUser.owner]) {
            groupAssignments[legacyUser.owner] = [];
          }
          groupAssignments[legacyUser.owner].push(legacyUser.username);
        }
      }

      const successfulGroups = new Set<string>();
      for (const panel of panels) {
        for (const [groupName, emails] of Object.entries(groupAssignments)) {
          if (emails.length === 0) continue;
          try {
            const res = await this.panelsService.assignClientToGroup(
              panel.id,
              emails,
              groupName,
            );
            if (res && res.success) {
              successfulGroups.add(groupName);
              clientsAssignedToGroups += emails.length;
            } else {
              failedAssignments += emails.length;
            }
          } catch (err) {
            failedAssignments += emails.length;
          }
        }
      }
      groupsCreated = successfulGroups.size;
    }

    return {
      panelsSynced: panels.length,
      clientsImported: totalSyncedClients,
      clientsMatched: matchedOwnerships,
      clientsMissing: missingOwnerships,
      groupsCreated,
      clientsAssignedToGroups,
      failedAssignments,
      panelReports: reports,
    };
  }
}

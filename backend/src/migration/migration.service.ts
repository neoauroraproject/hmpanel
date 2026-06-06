import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PanelsService } from '../panels/panels.service';
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
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      const tableNames = tables.map(t => t.name);

      if (!tableNames.includes('panels') || !tableNames.includes('admins') || !tableNames.includes('sanaei_users')) {
        db.close();
        throw new BadRequestException('Invalid database schema. Missing required tables.');
      }

      this.currentBackupPath = filePath;
      db.close();

      return { valid: true, message: 'Database validated successfully', path: filePath };
    } catch (error: any) {
      this.logger.error('Database validation failed', error);
      throw new BadRequestException(`Validation failed: ${error.message}`);
    }
  }

  async preview() {
    if (!this.currentBackupPath) throw new BadRequestException('No backup uploaded');
    const db = new Database(this.currentBackupPath, { fileMustExist: true });
    
    try {
      const panelsCount = (db.prepare('SELECT COUNT(*) as count FROM panels').get() as any).count;
      const adminsCount = (db.prepare('SELECT COUNT(*) as count FROM admins').get() as any).count;
      const usersCount = (db.prepare('SELECT COUNT(*) as count FROM sanaei_users').get() as any).count;

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
    if (!this.currentBackupPath) throw new BadRequestException('No backup uploaded');
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
          data: { name: 'Default Server', ipAddress: '127.0.0.1' }
        });
      }

      // 2. Import Panels
      const panels = db.prepare('SELECT * FROM panels').all() as any[];
      for (const p of panels) {
        const existing = await this.prisma.panel.findFirst({ where: { name: p.name } });
        if (existing) {
          // Skip existing to prevent overwriting
          this.logger.log(`Skipping existing panel: ${p.name}`);
          continue;
        } else {
          // Parse url to get webBasePath and apiBaseUrl
          let webBasePath = '';
          let apiBaseUrl = p.url;
          try {
            const urlObj = new URL(p.url);
            let path = urlObj.pathname.replace(/\/$/, '');
            const panelIndex = path.indexOf('/panel');
            if (panelIndex !== -1) {
              webBasePath = path.substring(0, panelIndex);
            } else {
              webBasePath = path;
            }
            apiBaseUrl = `${urlObj.origin}${webBasePath}`;
          } catch (err) {
            this.logger.warn(`Failed to parse URL for panel ${p.name}: ${p.url}. Using raw URL.`);
          }

          // Create new
          await this.prisma.panel.create({
            data: {
              serverId: defaultServer.id,
              name: p.name,
              url: p.url.replace(/\/$/, ''),
              subUrl: p.sub_url || null,
              apiToken: p.token || null,
              username: p.username,
              password: p.password,
              status: p.is_active ? 'online' : 'offline',
              panelType: p.panel_type || '3x-ui',
              webBasePath: webBasePath,
              apiBaseUrl: apiBaseUrl,
            }
          });
          importedPanels++;
        }
      }

      // 3. Import Admins
      const admins = db.prepare('SELECT * FROM admins').all() as any[];
      for (const a of admins) {
        let admin = await this.prisma.admin.findUnique({ where: { username: a.username } });
        
        if (!admin) {
          admin = await this.prisma.admin.create({
            data: {
              username: a.username,
              email: `${a.username}@migration.local`,
              passwordHash: a.hashed_password,
              role: 'RESELLER',
              status: a.is_active ? 'active' : 'suspended',
              expiryTime: a.expiry_date ? BigInt(new Date(a.expiry_date).getTime()) : 0n,
            }
          });
          importedAdmins++;
        }

        // Add traffic pool if they don't have one and traffic > 0
        if (a.traffic && a.traffic > 0) {
          const poolBytes = BigInt(a.traffic);
          const existingPool = await this.prisma.trafficPool.findFirst({ where: { adminId: admin.id } });
          if (!existingPool) {
            await this.prisma.trafficPool.create({
              data: {
                adminId: admin.id,
                totalLimit: poolBytes,
              }
            });
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

  async runPostImportSync() {
    const panels = await this.prisma.panel.findMany();
    const reports = [];

    let totalSyncedClients = 0;
    let matchedOwnerships = 0;
    let missingOwnerships = 0;

    for (const panel of panels) {
      try {
        const syncResult = await this.panelsService.sync(panel.id);
        reports.push({ panelName: panel.name, ...syncResult });

        if (syncResult.success) {
          totalSyncedClients += syncResult.syncedClients;
        }
      } catch (err: any) {
        reports.push({ panelName: panel.name, success: false, error: err.message });
      }
    }

    // Apply sanaei_users ownership mapping
    for (const legacyUser of this.sanaeiUsersCache) {
      const client = await this.prisma.client.findFirst({ where: { email: legacyUser.username } });
      const admin = await this.prisma.admin.findUnique({ where: { username: legacyUser.owner } });
      
      if (client && admin) {
        await this.prisma.client.update({
          where: { id: client.id },
          data: { adminId: admin.id, ownerTag: 'Whale Migration' }
        });
        matchedOwnerships++;
      } else {
        missingOwnerships++;
      }
    }

    return {
      panelsSynced: panels.length,
      clientsImported: totalSyncedClients,
      clientsMatched: matchedOwnerships,
      clientsMissing: missingOwnerships,
      panelReports: reports,
    };
  }
}

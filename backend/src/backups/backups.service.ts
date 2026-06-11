import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PanelsService } from '../panels/panels.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly backupDir = path.join(process.cwd(), 'backups');

  constructor(
    private prisma: PrismaService,
    private panelsService: PanelsService,
  ) {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  findAll() {
    return this.prisma.backup.findMany({
      select: {
        id: true, type: true, filePath: true, fileSize: true, checksum: true,
        tier: true, isManual: true, status: true, createdAt: true,
        panel: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(type: 'postgres' | 'x-ui-db' = 'postgres', tier: string = 'hourly', isManual: boolean = true, panelId?: string) {
    const timestamp = Date.now();
    const subDir = path.join(this.backupDir, type === 'postgres' ? 'system' : 'panels');
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    
    let filePath = '';
    let fileSize = 0n;
    let checksum = '';
    
    try {
      if (type === 'postgres') {
        filePath = path.join(subDir, `system-${tier}-${timestamp}.json`);
        
        // JSON Export
        const exportData = {
          admins: await this.prisma.admin.findMany(),
          inbounds: await this.prisma.inbound.findMany(),
          clients: await this.prisma.client.findMany(),
          panels: await this.prisma.panel.findMany(),
          trafficPools: await this.prisma.trafficPool.findMany(),
          systemSettings: await this.prisma.systemSetting.findMany(),
        };
        
        const jsonString = JSON.stringify(exportData, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        );
        fs.writeFileSync(filePath, jsonString);
        
        const stats = fs.statSync(filePath);
        fileSize = BigInt(stats.size);
        checksum = `sha256:${crypto.createHash('sha256').update(jsonString).digest('hex')}`;
        
      } else if (type === 'x-ui-db') {
        if (!panelId) throw new BadRequestException('panelId required for panel backup');
        const panel = await this.prisma.panel.findUnique({ where: { id: panelId } });
        if (!panel) throw new NotFoundException('Panel not found');
        
        filePath = path.join(subDir, `panel-${panel.id}-${tier}-${timestamp}.db`);
        
        // Real Panel Backup via API /panel/api/server/getDb
        // In 3x-ui, the backup route is /panel/api/server/getDb
        const getDbUrl = `${panel.url.replace(/\/+$/, '')}/panel/api/server/getDb`;
        
        const res = await axios.get(getDbUrl, {
          headers: { 
            Authorization: `Bearer ${panel.apiToken}`,
            // In case it's cookie-based auth on 3x-ui, we could try forwarding auth
            Cookie: `session=${panel.apiToken}` 
          },
          responseType: 'stream',
          timeout: 30000,
        });
        
        const writer = fs.createWriteStream(filePath);
        res.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', () => resolve(true));
          writer.on('error', reject);
        });
        
        const stats = fs.statSync(filePath);
        fileSize = BigInt(stats.size);
        checksum = 'raw-db-download';
      }
      
      return await this.prisma.backup.create({
        data: {
          type,
          filePath,
          fileSize,
          checksum,
          tier,
          isManual,
          status: 'completed',
          panelId: type === 'x-ui-db' ? panelId : null,
        },
      });
      
    } catch (e: any) {
      this.logger.error(`Backup failed: ${e.message}`);
      throw new BadRequestException(`Backup failed: ${e.message}`);
    }
  }

  async remove(id: string) {
    const found = await this.prisma.backup.findUnique({ where: { id }, select: { id: true, filePath: true } });
    if (!found) throw new NotFoundException('Backup not found');
    
    if (fs.existsSync(found.filePath)) {
      fs.unlinkSync(found.filePath);
    }
    
    await this.prisma.backup.delete({ where: { id } });
    return { deleted: true };
  }

  async restore(id: string) {
    const found = await this.prisma.backup.findUnique({ where: { id }, select: { id: true, filePath: true, type: true } });
    if (!found) throw new NotFoundException('Backup not found');
    
    if (!fs.existsSync(found.filePath)) throw new NotFoundException('Backup file missing on disk');
    
    // Create safety backup
    await this.create(found.type as 'postgres' | 'x-ui-db', 'safety_pre_restore', false);
    
    if (found.type === 'postgres') {
      const data = JSON.parse(fs.readFileSync(found.filePath, 'utf8'));
      this.logger.log(`Restoring Platform DB from ${found.filePath}. Admins: ${data.admins?.length || 0}`);
      await this.restoreDataFromJSON(data);
    } else {
      this.logger.warn(`Restoring panel DB is manual only right now. Please upload ${found.filePath} to the panel manually.`);
      throw new BadRequestException('Panel DB restoration is a manual process. Please download the file and upload it to your 3x-ui server directly.');
    }
    
    return { restored: true, message: 'Restore completed successfully' };
  }

  async uploadPlatformRestore(fileBuffer: Buffer) {
    const timestamp = Date.now();
    const filePath = path.join(this.backupDir, 'system', `uploaded-restore-${timestamp}.json`);
    fs.writeFileSync(filePath, fileBuffer);
    
    // Create safety backup
    await this.create('postgres', 'safety_pre_upload_restore', false);
    
    const data = JSON.parse(fileBuffer.toString('utf8'));
    this.logger.log(`Restoring Platform DB from uploaded file. Admins: ${data.admins?.length || 0}`);
    await this.restoreDataFromJSON(data);
    
    return { restored: true, message: 'Platform data restored successfully from uploaded file' };
  }

  async getDownloadPath(id: string) {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) throw new NotFoundException('Backup not found');
    if (!fs.existsSync(backup.filePath)) throw new NotFoundException('Backup file not found on disk');
    return backup.filePath;
  }

  private async restoreDataFromJSON(data: any) {
    if (data.systemSettings) {
      for (const s of data.systemSettings) {
        await this.prisma.systemSetting.upsert({ where: { key: s.key }, create: s, update: s });
      }
    }
    
    if (data.admins) {
      for (const a of data.admins) {
        await this.prisma.admin.upsert({ where: { id: a.id }, create: a, update: a });
      }
    }

    if (data.panels) {
      for (const p of data.panels) {
        await this.prisma.panel.upsert({ where: { id: p.id }, create: p, update: p });
        
        try {
          // Sync panel immediately to pull inbounds and raw clients 
          // This ensures foreign keys are populated before we update clients!
          await this.panelsService.sync(p.id);
        } catch (e: any) {
          this.logger.error(`Failed to sync panel ${p.id} during restore`, e.message);
        }
      }
    }

    // Optionally restore inbounds if they were in the backup (new backups only)
    if (data.inbounds) {
      for (const ib of data.inbounds) {
        // Strip out relations/incompatible fields if needed
        const { panel, ...cleanIb } = ib as any;
        await this.prisma.inbound.upsert({ where: { id: ib.id }, create: cleanIb, update: cleanIb });
      }
    }

    if (data.clients) {
      for (const c of data.clients) {
        // Only update metadata on clients. The sync above already created them based on actual panel data.
        await this.prisma.client.updateMany({
          where: { uuid: c.uuid },
          data: {
            adminId: c.adminId,
            email: c.email,
            remark: c.remark,
            ownerTag: c.ownerTag,
            subId: c.subId,
            subToken: c.subToken,
            flow: c.flow,
            enable: c.enable,
            disableReason: c.disableReason
          }
        });
      }
    }

    if (data.trafficPools) {
      for (const tp of data.trafficPools) {
        await this.prisma.trafficPool.upsert({ where: { id: tp.id }, create: tp, update: tp });
      }
    }
  }
}

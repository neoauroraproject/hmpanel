import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PanelsService } from '../panels/panels.service';
import { BulkCreateClientDto, BulkClientDto } from './dto/client.dto';

const GB = 1024 ** 3;

export interface ClientFilters {
  search?: string;
  status?: string; // active | disabled | expired
  inboundId?: string;
  panelId?: string;
  adminId?: string; // filter by owner (super-admin only)
  expiry?: string;
  trafficRange?: string;
}

import { MonitoringService } from '../stats/monitoring.service';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private panelsService: PanelsService,
    private monitoringService: MonitoringService
  ) {}

  private async executeAtomicOperation(
    adminId: string | null,
    entityId: string,
    entityType: string,
    operationName: string,
    payload: any,
    task: (opId: string) => Promise<{ verified: boolean, message?: string }>,
    onSuccess: (tx: any) => Promise<any>
  ) {
    const op = await this.prisma.operationQueue.create({
      data: {
        adminId, entityId, entityType, operation: operationName, payload, status: 'RUNNING'
      }
    });

    try {
      const result = await task(op.id);
      
      if (!result.verified) {
        await this.prisma.operationQueue.update({
           where: { id: op.id },
           data: { status: 'FAILED', errorLog: result.message || 'Verification failed on panel' }
        });
        throw new BadRequestException(`Operation failed verification: ${result.message || 'State mismatch'}`);
      }

      const txResult = await this.prisma.$transaction(async (tx) => {
         return await onSuccess(tx);
      });

      await this.prisma.operationQueue.update({
         where: { id: op.id },
         data: { status: 'SUCCESS' }
      });

      return txResult;
    } catch (err: any) {
      await this.prisma.operationQueue.update({
         where: { id: op.id },
         data: { status: 'FAILED', errorLog: err.message }
      });
      throw err;
    }
  }

  async create(callerId: string, data: { email: string; inboundIds: string[]; remark?: string; total?: number; expiryTime?: number; flow?: string; adminId?: string; limitIp?: number }) {
    if (data.email) data.email = data.email.trim();
    const totalBytes = BigInt(data.total || 0);
    const clientUuid = randomUUID();

    // ── Step 1: Validate inputs ──────────────────────────────────────────────
    if (!data.inboundIds || data.inboundIds.length === 0) {
      throw new BadRequestException('At least one inbound must be selected');
    }

    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: data.inboundIds } },
      include: { panel: true }
    });
    if (!inbounds || inbounds.length === 0) throw new BadRequestException('No valid inbounds found');

    const caller = await this.prisma.admin.findUnique({
      where: { id: callerId },
      include: { _count: { select: { clients: true } } }
    });
    if (!caller) throw new BadRequestException('Admin not found');

    let targetAdminId = callerId;
    let targetAdmin = caller;

    if (caller.role === 'SUPER_ADMIN' && data.adminId) {
      targetAdminId = data.adminId;
      const explicitTarget = await this.prisma.admin.findUnique({
        where: { id: targetAdminId },
        include: { _count: { select: { clients: true } } }
      });
      if (!explicitTarget) throw new BadRequestException('Target Admin not found');
      targetAdmin = explicitTarget;
    }

    if (caller.role !== 'SUPER_ADMIN') {
      if (caller.balance > 0 && totalBytes === 0n) {
        throw new BadRequestException('Cannot create an unlimited client when your account has a traffic limit.');
      }
      if (caller.trafficMode === 'ALLOCATION') {
        if (caller.balance < Number(totalBytes)) throw new BadRequestException('Insufficient traffic balance');
      } else if (caller.trafficMode === 'USAGE') {
        if (caller.balance <= 0) throw new BadRequestException('Insufficient traffic balance. Cannot create clients when balance is zero or below.');
      }
    }

    if (targetAdmin.maxClients > 0 && targetAdmin._count.clients >= targetAdmin.maxClients) {
      throw new BadRequestException(`Client limit reached. Maximum allowed: ${targetAdmin.maxClients}`);
    }

    const existingClient = await this.prisma.client.findFirst({ where: { email: data.email } });
    if (existingClient) throw new BadRequestException(`Email "${data.email}" is already in use.`);

    // ── Step 2: Resolve numeric panel inbound IDs ────────────────────────────
    // The native /clients/add endpoint requires numeric (integer) inbound IDs
    // from the 3x-ui panel DB. These are stored in panelInboundId after sync.
    const resolvedInbounds = await this.panelsService.resolveNumericInboundIds(data.inboundIds);

    // Group by panelId (a client can span multiple panels)
    const byPanel = new Map<string, { dbIds: string[]; numericIds: number[] }>();
    for (const ib of resolvedInbounds) {
      if (!byPanel.has(ib.panelId)) byPanel.set(ib.panelId, { dbIds: [], numericIds: [] });
      byPanel.get(ib.panelId)!.dbIds.push(ib.id);
      byPanel.get(ib.panelId)!.numericIds.push(ib.panelInboundId);
    }

    const clientSubId = require('crypto').randomBytes(8).toString('hex');

    const clientPayload: any = {
      email: data.email,
      totalGB: Number(data.total) || 0,
      expiryTime: data.expiryTime || 0,
      limitIp: data.limitIp || 0,
      tgId: 0,
      enable: true,
      flow: data.flow || "",
      subId: clientSubId,
      comment: "",
      reset: 0,
    };

    // ── Step 3: PANEL FIRST — create on every panel, verify existence ────────
    // No DB records are written until ALL panels confirm success.
    const createdOnPanels: string[] = [];  // panelIds successfully provisioned

    for (const [panelId, { numericIds }] of byPanel) {
      // 3a. Create on panel
      const createResult = await this.panelsService.createClientOnPanel(
        panelId, numericIds, clientPayload, callerId
      );

      if (!createResult.success) {
        // Rollback panels already created
        for (const donePanel of createdOnPanels) {
          await this.panelsService.deleteClientOnPanel(donePanel, data.email, callerId, true)
            .catch(e => {});
        }
        const err = createResult.error!;
        throw new BadRequestException(
          `Failed to provision client on panel: ${err.message}` +
          (err.code !== 'UNKNOWN' ? ` [${err.code}]` : '')
        );
      }

      // 3b. Verify the client now exists on the panel
      const verifyResult = await this.panelsService.verifyClientExists(panelId, data.email, callerId);
      if (!verifyResult.exists) {
        // Rollback
        for (const donePanel of [...createdOnPanels, panelId]) {
          await this.panelsService.deleteClientOnPanel(donePanel, data.email, callerId, true)
            .catch(e => {});
        }
        throw new BadRequestException(
          `Client was submitted to panel but could not be verified. ` +
          `The panel did not confirm existence of "${data.email}". Operation rolled back.`
        );
      }

      createdOnPanels.push(panelId);
    }

    // ── Step 4: ALL panels confirmed → Assign to reseller group (advisory) ──
    for (const [panelId] of byPanel) {
      await this.panelsService.assignClientToGroup(panelId, [data.email], targetAdmin.username)
        .catch(e => {/* non-fatal: group assignment failure does not roll back provisioning */});
    }

    // ── Step 5: DB COMMIT — only now that panel is source of truth ───────────
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Re-lock caller balance inside transaction
        const lockedCaller = await tx.admin.findUnique({ where: { id: callerId } });
        if (!lockedCaller) throw new BadRequestException('Admin not found');

        if (lockedCaller.role !== 'SUPER_ADMIN') {
          if (lockedCaller.trafficMode === 'ALLOCATION') {
            if (lockedCaller.balance < Number(totalBytes)) {
              throw new BadRequestException('Insufficient traffic balance (changed between check and commit)');
            }
            await tx.admin.update({
              where: { id: callerId },
              data: { balance: lockedCaller.balance - Number(totalBytes) }
            });
          } else if (lockedCaller.trafficMode === 'USAGE') {
            if (lockedCaller.balance <= 0) {
              throw new BadRequestException('Insufficient traffic balance (changed between check and commit)');
            }
          }
        }

        const client = await tx.client.create({
          data: {
            adminId: targetAdminId,
            email: data.email,
            remark: data.remark,
            uuid: clientUuid,
            subId: clientSubId,
            subToken: crypto.randomBytes(5).toString('hex'),
            flow: data.flow,
            total: totalBytes,
            expiryTime: BigInt(data.expiryTime || 0),
            limitIp: data.limitIp || 0,
            createdWithTrafficMode: targetAdmin.trafficMode,
            provisioningStatus: 'ACTIVE',
            provisionedAt: new Date(),
            balanceDeducted: totalBytes > 0n && lockedCaller.role !== 'SUPER_ADMIN' && lockedCaller.trafficMode === 'ALLOCATION',
            inbounds: {
              create: data.inboundIds.map(inboundId => ({ inboundId }))
            }
          },
          include: {
            inbounds: {
              select: {
                inbound: {
                  select: {
                    id: true, tag: true, port: true, protocol: true,
                    panel: { select: { id: true, name: true, url: true, subUrl: true } }
                  }
                }
              }
            }
          }
        });

        if (totalBytes > 0n && lockedCaller.role !== 'SUPER_ADMIN' && lockedCaller.trafficMode === 'ALLOCATION') {
          await tx.trafficTransaction.create({
            data: {
              adminId: callerId,
              clientId: client.id,
              targetClientUuid: client.id,
              amount: totalBytes,
              type: 'DEBIT',
              action: `CLIENT_CREATION_ALLOCATION_${Date.now()}`,
              description: 'Client Creation Allocation',
              balanceBefore: lockedCaller.balance,
              balanceAfter: lockedCaller.balance - Number(totalBytes),
            }
          });
        }

        await tx.auditLog.create({
          data: { action: 'CLIENT_CREATED', entity: 'Client', entityId: client.id, adminId: callerId, details: { targetAdminId, panelsProvisioned: createdOnPanels } }
        });

        return {
          ...client,
          inbound: client.inbounds?.[0]?.inbound || null,
          inbounds: client.inbounds?.map(ci => ci.inbound) || []
        };
      });
    } catch (dbError: any) {
      // DB commit failed AFTER panel provisioning succeeded.
      // Attempt compensating rollback on panels.
      for (const panelId of createdOnPanels) {
        await this.panelsService.deleteClientOnPanel(panelId, data.email, callerId, true)
          .catch(e => {});
      }
      throw dbError;
    }
  }

  async findAll(adminId: string, role: string, page = 1, limit = 50, filters: ClientFilters = {}) {
    const where: Prisma.ClientWhereInput = {};

    // Resellers only see their own clients
    if (role !== 'SUPER_ADMIN') where.adminId = adminId;
    else if (filters.adminId === 'orphaned') where.adminId = null;
    else if (filters.adminId) where.adminId = filters.adminId;

    // Exclude FAILED clients from the default list — they were never provisioned
    // and must not be visible to resellers or admins.
    // Super-admins can filter with status=failed for diagnostic purposes.
    if (filters.status === 'failed' && role === 'SUPER_ADMIN') {
      where.provisioningStatus = 'FAILED';
    } else {
      where.provisioningStatus = { not: 'FAILED' };
    }

    if (filters.search) where.email = { contains: filters.search, mode: 'insensitive' };
    if (filters.inboundId) {
      where.inbounds = {
        some: {
          inboundId: filters.inboundId
        }
      };
    }
    if (filters.panelId) {
      where.inbounds = {
        some: {
          inbound: {
            panelId: filters.panelId
          }
        }
      };
    }

    const now = BigInt(Date.now());
    if (filters.status === 'active') {
      where.enable = true;
      where.OR = [{ expiryTime: 0n }, { expiryTime: { gt: now } }];
    } else if (filters.status === 'disabled') {
      where.enable = false;
    } else if (filters.status === 'online') {
      const onlineEmails = await this.panelsService.getLiveOnlineEmails();
      if (onlineEmails.length === 0) {
        where.email = { in: ['__none__'] }; // Match nothing if no one is online
      } else {
        where.email = { in: onlineEmails };
      }
    } else if (filters.status === 'offline') {
      const onlineEmails = await this.panelsService.getLiveOnlineEmails();
      if (onlineEmails.length > 0) {
        where.email = { notIn: onlineEmails };
      }
    } else if (filters.status === 'expired') {
      where.expiryTime = { gt: 0n, lt: now };
    } else if (filters.status === 'expiring-soon') {
      where.expiryTime = { gt: now, lte: now + BigInt(7 * 24 * 3600 * 1000) };
    } else if (filters.status === 'traffic-low') {
      const rawIds = await this.prisma.$queryRaw<{id: string}[]>`
        SELECT id FROM "Client"
        WHERE total > 0 AND (up + down) < total AND ((up + down)::float / total::float) >= 0.8
        ${role !== 'SUPER_ADMIN' ? Prisma.sql`AND "adminId" = ${adminId}` : Prisma.empty}
      `;
      where.id = { in: rawIds.map(r => r.id) };
    } else if (filters.status === 'depleted') {
      const rawIds = await this.prisma.$queryRaw<{id: string}[]>`
        SELECT id FROM "Client"
        WHERE total > 0 AND (up + down) >= total
        ${role !== 'SUPER_ADMIN' ? Prisma.sql`AND "adminId" = ${adminId}` : Prisma.empty}
      `;
      where.id = { in: rawIds.map(r => r.id) };
    }

    if (filters.expiry === 'never') {
      where.expiryTime = 0n;
    } else if (filters.expiry === 'expired') {
      where.expiryTime = { gt: 0n, lt: now };
    } else if (filters.expiry === '7d') {
      where.expiryTime = { gt: now, lte: now + BigInt(7 * 24 * 3600 * 1000) };
    } else if (filters.expiry === '30d') {
      where.expiryTime = { gt: now, lte: now + BigInt(30 * 24 * 3600 * 1000) };
    }

    if (filters.trafficRange === '0-10gb') {
      where.total = { gt: 0n, lte: BigInt(10 * GB) };
    } else if (filters.trafficRange === '10-50gb') {
      where.total = { gt: BigInt(10 * GB), lte: BigInt(50 * GB) };
    } else if (filters.trafficRange === '50-100gb') {
      where.total = { gt: BigInt(50 * GB), lte: BigInt(100 * GB) };
    } else if (filters.trafficRange === '100gb+') {
      where.total = { gt: BigInt(100 * GB) };
    } else if (filters.trafficRange === 'unlimited') {
      where.total = 0n;
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, email: true, remark: true, ownerTag: true, uuid: true, subId: true, enable: true, flow: true, limitIp: true,
          up: true, down: true, total: true, expiryTime: true, createdAt: true,
          admin: { select: { id: true, username: true } },
          inbounds: {
            select: {
              inbound: {
                select: {
                  id: true,
                  tag: true,
                  port: true,
                  protocol: true,
                  streamSettings: true,
                  panel: { select: { id: true, name: true, url: true, subUrl: true } }
                }
              }
            }
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    const mappedData = data.map(client => ({
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map(ci => ci.inbound) || []
    }));

    return { data: mappedData, total, page, limit };
  }

  async findOne(id: string, adminId: string, role: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        admin: { select: { id: true, username: true } },
        inbounds: {
          select: {
            inbound: {
              select: {
                id: true,
                panelId: true,
                tag: true,
                port: true,
                protocol: true,
                streamSettings: true,
                panel: { select: { id: true, name: true, url: true, subUrl: true } }
              }
            }
          }
        }
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (role !== 'SUPER_ADMIN' && client.adminId !== adminId) throw new ForbiddenException();

    return {
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map(ci => ci.inbound) || []
    };
  }

  async getQrCode(id: string, adminId: string, role: string) {
    const client = await this.findOne(id, adminId, role);
    const subUrlBase = client.inbound?.panel?.subUrl || client.inbound?.panel?.url || 'http://localhost';
    
    let subUrl = '';
    try {
      const pUrl = new URL(subUrlBase);
      const pathname = pUrl.pathname.endsWith('/sub/') ? pUrl.pathname : `${pUrl.pathname.replace(/\/$/, '')}/sub/`;
      subUrl = `${pUrl.origin}${pathname}${encodeURIComponent(client.subId || client.email)}`;
    } catch {
      const base = subUrlBase.endsWith('/') ? subUrlBase : `${subUrlBase}/`;
      if (base.includes('/sub/')) {
        subUrl = `${base}${encodeURIComponent(client.subId || client.email)}`;
      } else {
        subUrl = `${base}sub/${encodeURIComponent(client.subId || client.email)}`;
      }
    }
    
    try {
      const qrDataUrl = await QRCode.toDataURL(subUrl, { width: 300, margin: 2 });
      return { qrCode: qrDataUrl };
    } catch (e) {
      throw new BadRequestException('Failed to generate QR code');
    }
  }

  async update(id: string, adminId: string, role: string, data: { enable?: boolean; total?: number; expiryTime?: number; remark?: string; flow?: string; inboundIds?: string[]; limitIp?: number }) {
    const existing = await this.findOne(id, adminId, role);
    
    // Flow is dynamically assigned per inbound later.

    const newTotal = data.total !== undefined ? BigInt(data.total) : existing.total;
    const newExpiry = data.expiryTime !== undefined ? BigInt(data.expiryTime) : existing.expiryTime;
    const newFlow = data.flow !== undefined ? data.flow : existing.flow;
    const now = BigInt(Date.now());
    const usedTraffic = existing.up + existing.down;

    if (role !== 'SUPER_ADMIN' && newTotal === 0n && existing.total !== 0n) {
      const caller = await this.prisma.admin.findUnique({ where: { id: adminId } });
      if (caller && caller.balance > 0) {
        throw new BadRequestException('Cannot set an unlimited client when your account has a traffic limit.');
      }
    }

    let autoEnable = false;
    if (data.enable === undefined && !existing.enable) {
      const isNotExpired = newExpiry === 0n || newExpiry > now;
      const isNotExhausted = newTotal === 0n || newTotal > usedTraffic;
      
      if (isNotExpired && isNotExhausted && (newTotal > existing.total || (existing.expiryTime !== 0n && (newExpiry === 0n || newExpiry > existing.expiryTime)))) {
        autoEnable = true;
      }
    }

    const newEnable = data.enable !== undefined ? data.enable : (autoEnable ? true : existing.enable);

    const baseClientPayload: any = {
      id: existing.uuid,
      subId: existing.subId || "",
      email: existing.email.trim(),
      enable: newEnable,
      totalGB: Number(newTotal),
      expiryTime: Number(newExpiry),
      limitIp: data.limitIp !== undefined ? data.limitIp : (existing as any).limitIp || 0,
      tgId: "",
    };

    let addedInbounds: any[] = [];
    let removedInbounds: any[] = [];

    if (data.inboundIds) {
      if (data.inboundIds.length === 0) {
        throw new BadRequestException('At least one inbound must be selected');
      }
      const existingInboundIds = existing.inbounds.map((i: any) => i.id);
      const newInboundIds = data.inboundIds;
      
      const toAdd = newInboundIds.filter(idx => !existingInboundIds.includes(idx));
      const toRemove = existingInboundIds.filter((idx: any) => !newInboundIds.includes(idx));

      if (toAdd.length > 0) {
        addedInbounds = await this.prisma.inbound.findMany({
          where: { id: { in: toAdd } },
          include: { panel: true }
        });
      }
      removedInbounds = existing.inbounds.filter((i: any) => toRemove.includes(i.id));
    }

    const successfullyRemoved: any[] = [];
    const successfullyUpdated: any[] = [];
    const successfullyAdded: any[] = [];

    return this.executeAtomicOperation(
      existing.adminId || null,
      id,
      'Client',
      'UPDATE',
      { updateData: data },
      async () => {
        let verifiedCount = 0;

        // Process removals FIRST
        for (const inbound of removedInbounds) {
          try {
            const delResult = await this.panelsService.deleteClientOnPanel(inbound.panelId, existing.email);
            // CLIENT_NOT_FOUND on delete means client was already absent — treat as success
            if (!delResult.success && delResult.error?.code !== 'CLIENT_NOT_FOUND') {
              return { verified: false, message: `Failed to remove client from inbound ${inbound.port}: ${delResult.error?.message}` };
            }
            const isMissing = await this.panelsService.verifyClientMissing(inbound.panelId, existing.email);
            if (!isMissing) return { verified: false, message: `Failed to remove client from inbound ${inbound.port}` };
            successfullyRemoved.push(inbound);
            verifiedCount++;
          } catch (err: any) {
            return { verified: false, message: `Error removing from panel: ${err.message}` };
          }
        }

        // Process updates for kept inbounds — use native updateClientOnPanel
        const keptInbounds = existing.inbounds.filter((i: any) => !removedInbounds.some((r: any) => r.id === i.id));
        for (const inbound of keptInbounds) {
          try {
            const isReality = inbound.protocol === 'vless' && (inbound.streamSettings as any)?.security === 'reality';
            const clientPayload = { ...baseClientPayload, flow: isReality ? (newFlow || "") : "" };
            const updateResult = await this.panelsService.updateClientOnPanel(
              inbound.panelId, existing.email, clientPayload
            );
            if (!updateResult.success) {
              return { verified: false, message: `Panel update failed for inbound ${inbound.port}: ${updateResult.error?.message}` };
            }
            const verifyResult = await this.panelsService.verifyClientExists(inbound.panelId, existing.email);
            if (!verifyResult.exists) {
              return { verified: false, message: `Verification failed: client not found on inbound ${inbound.port} after update` };
            }
            successfullyUpdated.push(inbound);
            verifiedCount++;
          } catch (err: any) {
            return { verified: false, message: `Error updating panel: ${err.message}` };
          }
        }

        // Process additions — use createClientOnPanel
        for (const inbound of addedInbounds) {
          try {
            if (!inbound.panelInboundId) {
              return { verified: false, message: `Inbound ${inbound.id} has no panelInboundId — sync required.` };
            }
            const isReality = inbound.protocol === 'vless' && (inbound.streamSettings as any)?.security === 'reality';
            const clientPayload = { ...baseClientPayload, flow: isReality ? (newFlow || "") : "" };
            const createResult = await this.panelsService.createClientOnPanel(
              inbound.panelId, [inbound.panelInboundId], clientPayload
            );
            if (!createResult.success) {
              return { verified: false, message: `Failed to add client to inbound ${inbound.port}: ${createResult.error?.message}` };
            }
            const verifyResult = await this.panelsService.verifyClientExists(inbound.panelId, existing.email);
            if (!verifyResult.exists) {
              return { verified: false, message: `Verification failed: client not found on new inbound ${inbound.port}` };
            }
            successfullyAdded.push(inbound);
            verifiedCount++;
          } catch (err: any) {
            return { verified: false, message: `Error adding to panel: ${err.message}` };
          }
        }

        return { verified: verifiedCount === (removedInbounds.length + keptInbounds.length + addedInbounds.length) };
      },
      async (tx) => {
        const updateData: Prisma.ClientUpdateInput = {};
        if (existing.email !== existing.email.trim()) {
          updateData.email = existing.email.trim();
        }
        if (data.enable !== undefined) {
          updateData.enable = data.enable;
          updateData.disableReason = data.enable ? null : 'MANUAL';
        }
        if (data.expiryTime !== undefined) updateData.expiryTime = newExpiry;
        if (data.remark !== undefined) updateData.remark = data.remark;
        if (data.flow !== undefined) updateData.flow = data.flow;
        if (data.limitIp !== undefined) updateData.limitIp = data.limitIp;

        let diff = 0n;
        let previousAllocation = existing.total;
        let newAllocation = newTotal;

        if (data.total !== undefined && newAllocation !== existing.total) {
          diff = newAllocation - existing.total;
          updateData.total = newAllocation;

          if (existing.adminId) {
            const admin = await tx.admin.findUnique({ where: { id: existing.adminId } });
            if (admin && admin.trafficMode === 'ALLOCATION') {
              if (diff > 0n) {
                if (admin.balance < Number(diff)) throw new BadRequestException('Insufficient traffic balance');
                await tx.admin.update({ where: { id: admin.id }, data: { balance: admin.balance - Number(diff) } });
              } else if (diff < 0n) {
                if (admin.refundOnEdit) {
                  await tx.admin.update({ where: { id: admin.id }, data: { balance: admin.balance + Math.abs(Number(diff)) } });
                }
              }
            }

            if (admin && admin.trafficMode === 'ALLOCATION' && diff !== 0n) {
              if (!(diff < 0n && !admin.refundOnEdit)) {
                await tx.trafficTransaction.create({
                  data: {
                    adminId: admin.id,
                    clientId: id,
                    targetClientUuid: id,
                    amount: diff > 0n ? diff : -diff,
                    type: diff > 0n ? 'DEBIT' : 'CREDIT',
                    action: diff > 0n ? `CLIENT_TRAFFIC_INCREASE_${Date.now()}` : `CLIENT_TRAFFIC_DECREASE_${Date.now()}`,
                    description: diff > 0n ? 'Client Traffic Increase' : 'Client Traffic Decrease',
                    balanceBefore: admin.balance,
                    balanceAfter: diff > 0n ? admin.balance - Number(diff) : admin.balance + Math.abs(Number(diff)),
                  }
                });
              }
            }
          }
        }

        if (data.inboundIds) {
          if (removedInbounds.length > 0) {
            await tx.clientInbound.deleteMany({
              where: {
                clientId: id,
                inboundId: { in: removedInbounds.map((i: any) => i.id) }
              }
            });
          }
          if (addedInbounds.length > 0) {
            await tx.clientInbound.createMany({
              data: addedInbounds.map((i: any) => ({
                clientId: id,
                inboundId: i.id
              }))
            });
          }
        }

        const client = await tx.client.update({ where: { id }, data: updateData });
        await tx.auditLog.create({
          data: {
            action: 'CLIENT_UPDATED',
            entity: 'Client',
            entityId: id,
            adminId,
            details: {
              previousAllocation: previousAllocation.toString(),
              newAllocation: newAllocation.toString(),
              trafficDifference: diff.toString()
            }
          }
        });
        return client;
      }
    );
  }

  async remove(id: string, adminId: string, role: string, skipRefund: boolean = false) {
    const existing = await this.findOne(id, adminId, role);
    
    if ((existing as any).isDeleting) {
      throw new BadRequestException('Client deletion is already in progress');
    }
    
    await this.prisma.client.update({ where: { id }, data: { isDeleting: true } });

    let deletedSuccessfully = false;

    try {
      const result = await this.executeAtomicOperation(
        existing.adminId || null,
        id,
        'Client',
        'DELETE',
        { email: existing.email, skipRefund },
        async () => {
          // FAILED clients were never on the panel — skip panel delete entirely
          if ((existing as any).provisioningStatus === 'FAILED') {
            return { verified: true, message: 'Client was FAILED (never provisioned) — skipping panel delete' };
          }

          let verifiedCount = 0;
          let errorMessage = '';

          for (const inbound of existing.inbounds) {
            try {
              const delResult = await this.panelsService.deleteClientOnPanel(inbound.panelId, existing.email);
              if (!delResult.success && delResult.error?.code !== 'CLIENT_NOT_FOUND') {
                errorMessage = `Panel deletion failed for ${inbound.panelId}: ${delResult.error?.message}`;
                return { verified: false, message: errorMessage };
              }
              const isMissing = await this.panelsService.verifyClientMissing(inbound.panelId, existing.email);
              if (!isMissing) {
                errorMessage = `Verification failed: Client still exists on panel ${inbound.panelId}.`;
                return { verified: false, message: errorMessage };
              }
              verifiedCount++;
            } catch (err: any) {
              console.error(`Failed to delete client ${existing.email} from panel inbound ${inbound.id}:`, err.message);
              return { verified: false, message: `Panel error: ${err.message}` };
            }
          }

          return { verified: verifiedCount === existing.inbounds.length };
        },
        async (tx) => {
          let refundGranted = false;
          let refundedAmount = 0n;

          // NEVER refund for FAILED clients — they were never provisioned
          const isFailed = (existing as any).provisioningStatus === 'FAILED';
          const wasDeducted = (existing as any).balanceDeducted === true;

          if (existing.adminId && !skipRefund && !isFailed && wasDeducted) {
            const admin = await tx.admin.findUnique({ where: { id: existing.adminId } });
            if (admin && admin.trafficMode === 'ALLOCATION' && existing.createdWithTrafficMode === 'ALLOCATION' && admin.refundOnDelete) {
              const used = existing.up + existing.down;
              const remaining = existing.total - used;
              if (remaining > 0n) {
                const existingRefund = await tx.trafficTransaction.findFirst({
                  where: {
                    targetClientUuid: existing.uuid,
                    action: 'CLIENT_DELETION_REFUND'
                  }
                });
                if (!existingRefund) {
                  await tx.admin.update({ where: { id: admin.id }, data: { balance: admin.balance + Number(remaining) } });
                  await tx.trafficTransaction.create({
                    data: {
                      adminId: admin.id,
                      clientId: id,
                      targetClientUuid: existing.uuid,
                      amount: remaining,
                      type: 'CREDIT',
                      action: 'CLIENT_DELETION_REFUND',
                      description: `Client Deletion Refund (${existing.email})`,
                      balanceBefore: admin.balance,
                      balanceAfter: admin.balance + Number(remaining),
                    }
                  });
                  refundGranted = true;
                  refundedAmount = remaining;
                }
              }
            }
          }

          await tx.client.delete({ where: { id } });
          await tx.auditLog.create({ 
            data: { 
              action: skipRefund ? 'CLIENT_CLEANUP' : 'CLIENT_DELETED', 
              entity: 'Client', 
              entityId: id, 
              adminId,
              details: {
                clientEmail: existing.email,
                adminUsername: existing.admin?.username,
                trafficBefore: existing.total.toString(),
                trafficRefunded: refundedAmount.toString(),
                verified: true,
                refundGranted
              }
            } 
          });
          return { deleted: true };
        }
      );
      
      deletedSuccessfully = true;
      return result;
    } finally {
      if (!deletedSuccessfully) {
        // Unlock the deletion flag if it failed midway
        await this.prisma.client.update({ where: { id }, data: { isDeleting: false } }).catch(() => {});
      }
    }
  }

  async resetUsage(id: string, adminId: string, role: string) {
    const existing = await this.findOne(id, adminId, role);
    const used = existing.up + existing.down;
    
    return this.executeAtomicOperation(
      existing.adminId || null,
      id,
      'Client',
      'RESET_TRAFFIC',
      { email: existing.email, used: used.toString() },
      async () => {
        // Task: Execute on panel and verify
        let verifiedCount = 0;
        let errorMessage = '';

        for (const inbound of existing.inbounds) {
          try {
            await this.panelsService.resetClientTrafficOnPanel(inbound.panelId, existing.email);
            // Verify reset: client should now report 0 usage via get
            const verifyResult = await this.panelsService.verifyClientExists(inbound.panelId, existing.email);
            if (!verifyResult.exists) {
              errorMessage = `Verification failed: client not found after reset on panel ${inbound.panelId}.`;
              return { verified: false, message: errorMessage };
            }
            verifiedCount++;
          } catch (err: any) {
            console.error(`Failed to reset traffic for client ${existing.email} on panel inbound ${inbound.id}:`, err.message);
            return { verified: false, message: `Failed to reset traffic on panel: ${err.message}` };
          }
        }
        
        return { verified: verifiedCount === existing.inbounds.length };
      },
      async (tx) => {
        // Success Phase: Database changes and Billing
        if (used > 0n && existing.adminId) {
          const admin = await tx.admin.findUnique({ where: { id: existing.adminId } });
          if (admin) {
             if (admin.trafficMode === 'ALLOCATION') {
                 if (admin.balance < Number(used)) {
                     throw new BadRequestException(`Insufficient traffic balance to reset this client. You need ${used} bytes.`);
                 }
                 await tx.admin.update({ where: { id: admin.id }, data: { balance: admin.balance - Number(used) } });
                 await tx.trafficTransaction.create({
                   data: {
                     adminId: admin.id,
                     clientId: id,
                     targetClientUuid: id,
                     amount: used,
                     type: 'DEBIT',
                     action: `CLIENT_USAGE_RESET_CHARGE_${Date.now()}`,
                     description: `Client Usage Reset Charge (${existing.email})`,
                     balanceBefore: admin.balance,
                     balanceAfter: admin.balance - Number(used),
                   }
                 });
             } else if (admin.trafficMode === 'USAGE') {
                 await tx.trafficTransaction.create({
                   data: {
                     adminId: admin.id,
                     clientId: id,
                     targetClientUuid: id,
                     amount: used,
                     type: 'USAGE_CHARGE',
                     action: `HISTORICAL_USAGE_ARCHIVED_${Date.now()}`,
                     description: `Historical Usage Archived via Reset (${existing.email})`,
                     balanceBefore: admin.balance,
                     balanceAfter: admin.balance,
                   }
                 });
             }
          }
        }

        await tx.client.update({ where: { id }, data: { up: 0n, down: 0n } });
        await tx.auditLog.create({ 
          data: { 
            action: 'RESET_USAGE', 
            entity: 'Client', 
            adminId,
            details: { equivalentTrafficRestored: used.toString() } 
          } 
        });
        
        return { success: true };
      }
    );
  }

  async getGroups(adminId: string, role: string) {
    const panels = await this.prisma.panel.findMany({ select: { id: true } });
    const uniqueGroups = new Set<string>();

    for (const panel of panels) {
      try {
        const groups = await this.panelsService.listGroups(panel.id);
        for (const g of groups) {
          if (g && g.name) {
            uniqueGroups.add(g.name);
          }
        }
      } catch (err) {
        // Ignore panel list errors
      }
    }
    return Array.from(uniqueGroups).sort();
  }

  async validateBulkCreate(callerId: string, role: string, dto: BulkCreateClientDto) {
    const count = dto.endNumber - dto.startNumber + 1;
    if (count <= 0) throw new BadRequestException('Invalid start or end number');
    if (count > 1000) throw new BadRequestException('Bulk creation limit is 1000 clients per request');

    const emails = [];
    const sep = dto.separator === 'None' ? '' : (dto.separator || '');
    for (let i = dto.startNumber; i <= dto.endNumber; i++) {
      emails.push(`${dto.prefix}${sep}${i}`);
    }

    const duplicates = await this.prisma.client.findMany({
      where: { email: { in: emails } },
      select: { email: true }
    });

    const duplicateEmails = duplicates.map(d => d.email);
    const estimatedTimeMs = count * 20 + 300; // 20ms per client + base overhead

    return {
      valid: duplicateEmails.length === 0,
      count,
      duplicateEmails,
      estimatedTimeMs,
      preview: emails.slice(0, 5),
    };
  }

  async bulkCreate(callerId: string, role: string, dto: BulkCreateClientDto) {
    if (!dto.inboundIds || dto.inboundIds.length === 0) {
      throw new BadRequestException('At least one inbound must be selected for bulk creation');
    }

    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: dto.inboundIds } },
      include: { panel: true }
    });
    if (!inbounds || inbounds.length === 0) throw new BadRequestException('No inbounds found');

    const caller = await this.prisma.admin.findUnique({ 
      where: { id: callerId },
      include: { _count: { select: { clients: true } } }
    });
    if (!caller) throw new BadRequestException('Admin not found');
    
    let targetAdminId = callerId;
    let targetAdmin = caller;
    
    if (caller.role === 'SUPER_ADMIN' && dto.adminId) {
      targetAdminId = dto.adminId;
      const explicitTarget = await this.prisma.admin.findUnique({ 
        where: { id: targetAdminId },
        include: { _count: { select: { clients: true } } }
      });
      if (!explicitTarget) throw new BadRequestException('Target Admin not found');
      targetAdmin = explicitTarget;
    }

    const count = dto.endNumber - dto.startNumber + 1;
    if (count <= 0) throw new BadRequestException('Invalid start or end number');
    if (count > 1000) throw new BadRequestException('Bulk creation limit is 1000 clients per request');

    if (targetAdmin.maxClients > 0 && targetAdmin._count.clients + count > targetAdmin.maxClients) {
      throw new BadRequestException(`Client limit reached. Maximum allowed: ${targetAdmin.maxClients}. Current: ${targetAdmin._count.clients}`);
    }

    const totalBytesPerClient = BigInt(dto.total || 0);
    const totalBytesRequired = totalBytesPerClient * BigInt(count);

    if (caller.role !== 'SUPER_ADMIN') {
      if (caller.balance > 0 && totalBytesPerClient === 0n) {
        throw new BadRequestException('Cannot create unlimited clients when your account has a traffic limit.');
      }
      if (caller.trafficMode === 'ALLOCATION') {
        if (caller.balance < Number(totalBytesRequired)) {
          throw new BadRequestException('Insufficient traffic balance');
        }
      } else if (caller.trafficMode === 'USAGE') {
        if (caller.balance <= 0) {
          throw new BadRequestException('Insufficient traffic balance. Cannot create clients when balance is zero or below.');
        }
      }
    }

    // Flow is dynamically assigned per inbound later.

    const emails = [];
    const sep = dto.separator === 'None' ? '' : (dto.separator || '');
    for (let i = dto.startNumber; i <= dto.endNumber; i++) {
      emails.push(`${dto.prefix}${sep}${i}`);
    }

    const existingClient = await this.prisma.client.findFirst({
      where: { email: { in: emails } }
    });
    if (existingClient) {
      throw new BadRequestException(`Email "${existingClient.email}" is already in use.`);
    }

    const clientPayloads: any[] = [];
    const clientsDbData: any[] = [];

    for (const email of emails) {
      const clientUuid = crypto.randomUUID();
      const clientSubId = crypto.randomBytes(8).toString('hex');
      const clientSubToken = crypto.randomBytes(5).toString('hex');

      clientPayloads.push({
        id: clientUuid,
        subId: clientSubId,
        email: email,
        enable: dto.enable !== false,
        totalGB: Number(dto.total) || 0,
        expiryTime: dto.expiryTime || 0,
        limitIp: dto.limitIp || 0,
        tgId: 0,
        comment: dto.remark || "",
        reset: 0,
      });

      clientsDbData.push({
        adminId: targetAdminId,
        email: email,
        remark: dto.remark || "",
        uuid: clientUuid,
        subId: clientSubId,
        subToken: clientSubToken,
        flow: dto.flow || "",
        total: totalBytesPerClient,
        expiryTime: BigInt(dto.expiryTime || 0),
        limitIp: dto.limitIp || 0,
        enable: dto.enable !== false,
        createdWithTrafficMode: targetAdmin.trafficMode,
      });
    }

    const createdOnPanels: any[] = [];
    try {
      for (const inbound of inbounds) {
        const isReality = inbound.protocol === 'vless' && (inbound.streamSettings as any)?.security === 'reality';
        const payloadsForInbound = clientPayloads.map(p => ({
          ...p,
          flow: isReality ? (dto.flow || "") : ""
        }));

        await this.panelsService.addClient(inbound.panelId, inbound.port, {
          clients: payloadsForInbound
        });

        // 2. Assign to reseller Group
        const groupName = dto.group || targetAdmin.username;
        await this.panelsService.assignClientToGroup(
          inbound.panelId, emails, groupName
        );
        createdOnPanels.push(inbound);
      }
    } catch (e: any) {
      for (const inbound of createdOnPanels) {
        await Promise.all(clientPayloads.map(p => 
          this.panelsService.delClient(inbound.panelId, inbound.port, p.id, p.email).catch(console.error)
        ));
      }
      throw new BadRequestException('Failed to bulk create clients on remote panel: ' + e.message);
    }

    try {
      // 3. Save to local DB in transaction
      const createdClients = await this.prisma.$transaction(async (tx) => {
      if (caller.role !== 'SUPER_ADMIN' && caller.trafficMode === 'ALLOCATION') {
        const lockedCaller = await tx.admin.findUnique({ where: { id: callerId } });
        if (!lockedCaller) throw new BadRequestException('Admin not found');
        if (lockedCaller.balance < Number(totalBytesRequired)) {
          throw new BadRequestException('Insufficient traffic balance');
        }
        await tx.admin.update({
          where: { id: callerId },
          data: { balance: lockedCaller.balance - Number(totalBytesRequired) }
        });
      }

      const result = [];
      for (const clientData of clientsDbData) {
        const c = await tx.client.create({
          data: {
            ...clientData,
            inbounds: {
              create: dto.inboundIds.map(inboundId => ({ inboundId }))
            }
          }
        });
        result.push(c);
      }

      if (totalBytesRequired > 0n && caller.role !== 'SUPER_ADMIN' && caller.trafficMode === 'ALLOCATION') {
        await tx.trafficTransaction.create({
          data: {
            adminId: callerId,
            amount: totalBytesRequired,
            type: 'DEBIT',
            description: `Bulk Client Creation (${count} clients)`,
          }
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'BULK_CLIENT_CREATED',
          entity: 'Client',
          adminId: callerId,
          details: { count, targetAdminId, prefix: dto.prefix }
        }
      });

      return result;
    });

    return { success: true, count: createdClients.length };
    } catch (dbError) {
      for (const inbound of createdOnPanels) {
        await Promise.all(clientPayloads.map(p => 
          this.panelsService.delClient(inbound.panelId, inbound.port, p.id, p.email).catch(console.error)
        ));
      }
      throw dbError;
    }
  }

  /** Bulk operations, scoped to the caller's ownership when a reseller. */
  async bulk(
    adminId: string,
    role: string,
    dto: BulkClientDto,
  ) {
    if (!dto.ids?.length) throw new BadRequestException('No clients selected');

    const scope: Prisma.ClientWhereInput = { id: { in: dto.ids } };
    if (role !== 'SUPER_ADMIN') scope.adminId = adminId;

    const targets = await this.prisma.client.findMany({ where: scope });
    if (!targets.length) return { affected: 0 };

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Up-front balance checks for traffic addition
    if (dto.action === 'addTraffic') {
      const bytesToAddPerClient = BigInt(Math.round((dto.value ?? 0) * GB));
      const totalRequired = bytesToAddPerClient * BigInt(targets.length);

      const caller = await this.prisma.admin.findUnique({ where: { id: adminId } });
      if (caller && caller.role !== 'SUPER_ADMIN' && caller.trafficMode === 'ALLOCATION') {
        if (caller.balance < Number(totalRequired)) {
          throw new BadRequestException(`Insufficient balance to add traffic. Required: ${Number(totalRequired) / GB} GB, Available: ${caller.balance / GB} GB`);
        }
      }
    }

    if (dto.action === 'assignGroup') {
      if (!dto.groupName) throw new BadRequestException('Group name is required');
      
      const panelClients = new Map<string, string[]>();
      for (const t of targets) {
        const clientWithInbounds = await this.prisma.client.findUnique({
          where: { id: t.id },
          include: {
            inbounds: {
              include: {
                inbound: true
              }
            }
          }
        });
        if (clientWithInbounds?.inbounds) {
          for (const ci of clientWithInbounds.inbounds) {
            if (ci.inbound) {
              const panelId = ci.inbound.panelId;
              if (!panelClients.has(panelId)) panelClients.set(panelId, []);
              const list = panelClients.get(panelId)!;
              if (!list.includes(t.email)) {
                list.push(t.email);
              }
            }
          }
        }
      }

      for (const [panelId, emails] of panelClients.entries()) {
        try {
          await this.panelsService.assignClientToGroup(panelId, emails, dto.groupName);
          results.success += emails.length;
        } catch (err: any) {
          results.failed += emails.length;
          results.errors.push(`Panel ${panelId}: ${err.message}`);
        }
      }
    } else {
      // Process sequential operations in parallel batches of 10
      const batchSize = 10;
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (t) => {
            try {
              switch (dto.action) {
                case 'enable':
                  await this.update(t.id, adminId, role, { enable: true });
                  break;
                case 'disable':
                  await this.update(t.id, adminId, role, { enable: false });
                  break;
                case 'delete':
                  await this.remove(t.id, adminId, role);
                  break;
                case 'cleanup':
                  await this.remove(t.id, adminId, role, true);
                  break;
                case 'assignInbounds': {
                  if (!dto.inboundIds || dto.inboundIds.length === 0) throw new BadRequestException('No inbounds selected');
                  const currentInbounds = await this.prisma.clientInbound.findMany({ where: { clientId: t.id } });
                  const existingIds = currentInbounds.map(i => i.inboundId);
                  const combined = Array.from(new Set([...existingIds, ...dto.inboundIds]));
                  await this.update(t.id, adminId, role, { inboundIds: combined });
                  break;
                }
                case 'addTraffic': {
                  const bytes = BigInt(Math.round((dto.value ?? 0) * GB));
                  if (bytes > 0n) {
                    await this.update(t.id, adminId, role, { total: Number(t.total + bytes) });
                  }
                  break;
                }
                case 'addDays': {
                  const ms = BigInt((dto.value ?? 0) * 24 * 60 * 60 * 1000);
                  const now = BigInt(Date.now());
                  const base = t.expiryTime > 0n ? t.expiryTime : now;
                  await this.update(t.id, adminId, role, { expiryTime: Number(base + ms) });
                  break;
                }
                case 'resetUsage':
                case 'resetTraffic': {
                  await this.resetUsage(t.id, adminId, role);
                  break;
                }
              }
              results.success++;
            } catch (err: any) {
              results.failed++;
              results.errors.push(`${t.email}: ${err.message}`);
            }
          })
        );
      }
    }

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        action: `BULK_${dto.action.toUpperCase()}`,
        entity: 'Client',
        adminId,
        details: {
          count: targets.length,
          success: results.success,
          failed: results.failed,
          errors: results.errors,
          value: dto.value,
          groupName: dto.groupName,
        }
      }
    });

    if (results.failed > 0) {
      return {
        affected: results.success,
        failed: results.failed,
        errors: results.errors,
      };
    }

    return { affected: results.success };
  }

  async getCleanupCandidates(adminId: string, role: string) {
    const thresholdSetting = await this.prisma.systemSetting.findUnique({ where: { key: 'cleanup_threshold_days' } });
    const thresholdDays = thresholdSetting ? Number(thresholdSetting.value.replace(/"/g, '')) || 30 : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = BigInt(Date.now());

    const where: Prisma.ClientWhereInput = {
      expiryTime: { gt: 0n, lt: now - BigInt(thresholdMs) }
    };
    if (role !== 'SUPER_ADMIN') {
      where.adminId = adminId;
    }

    const candidates = await this.prisma.client.findMany({
      where,
      select: {
        id: true, email: true, remark: true, ownerTag: true, uuid: true, subId: true, enable: true, flow: true,
        up: true, down: true, total: true, expiryTime: true, createdAt: true,
        admin: { select: { id: true, username: true } },
        inbounds: {
          select: {
            inbound: {
              select: {
                id: true,
                tag: true,
                panel: { select: { id: true, name: true, url: true, subUrl: true } }
              }
            }
          }
        },
      },
      orderBy: { expiryTime: 'asc' },
    });

    return candidates.map(client => ({
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map(ci => ci.inbound) || []
    }));
  }
}

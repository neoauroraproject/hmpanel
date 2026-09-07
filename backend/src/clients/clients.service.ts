import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PanelsService } from '../panels/panels.service';
import { BulkCreateClientDto, BulkClientDto } from './dto/client.dto';
import {
  ClientLimitCaps,
  assertDeviceLimitAllowed,
  assertExpireDaysAllowed,
  resolveClientLimitCaps,
} from '../admins/admin-client-limits.util';

const GB = 1024 ** 3;

export interface ClientFilters {
  search?: string;
  status?: string; // active | disabled | expired
  inboundId?: string;
  panelId?: string;
  /** eylan | pasarguard | 3x-ui — type tabs on the Clients page */
  panelType?: string;
  adminId?: string; // filter by owner (super-admin only)
  expiry?: string;
  trafficRange?: string;
}

const NATIVE_PANEL_TYPES = ['eylan', 'pasarguard'] as const;

function isNativePanelTypeFilter(value?: string | null): value is 'eylan' | 'pasarguard' {
  return value === 'eylan' || value === 'pasarguard';
}

function pasarguardGroupIdsFromInbounds(
  inbounds: Array<{ remoteResourceId?: string | null; panelInboundId?: number | null }>,
  extras?: Record<string, unknown>,
): number[] {
  if (Array.isArray(extras?.groupIds) && extras.groupIds.length) {
    return extras.groupIds
      .map((g) => Number(g))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  return inbounds
    .map((i) => Number(i.remoteResourceId || i.panelInboundId))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function extrasForPasarguard(
  extras: Record<string, unknown> | undefined,
  inbounds: Array<{ remoteResourceId?: string | null; panelInboundId?: number | null }>,
  limitIp?: number,
): Record<string, unknown> {
  const next = { ...(extras || {}) };
  const groupIds = pasarguardGroupIdsFromInbounds(inbounds, next);
  if (groupIds.length) next.groupIds = groupIds;
  if (next.hwidLimit == null && limitIp != null) next.hwidLimit = limitIp;
  return next;
}

import { MonitoringService } from '../stats/monitoring.service';
import { RedisLockService } from '../common/utils/redis-lock.service';
import {
  supportsBulkClientApi,
  supportsBulkDelete,
} from '../common/utils/panel-version.util';
import { AdminQuotaService } from '../traffic/admin-quota.service';
import {
  resolve3xUiLimit,
} from './limit-mapper.util';
import { PanelDriverRegistry } from '../panels/native/panel-driver.registry';
import { PanelOperationGate } from '../panels/native/panel-operation-gate';
import { isExternalPanelType } from '../panels/native/native-panel-capabilities';
import { snapshotToClientUuid, mapSnapshotMeta } from '../panels/native/native-panel.orchestrator';
import { ClientOutputService } from './output/client-output.service';
import { FeatureFlagsService } from '../platform/architecture/feature-flags.service';
import { PLATFORM_FLAGS } from '../platform/architecture/feature-flags';
import { PolicyEngine } from '../authz/policy.engine';
import { DomainEventBusService } from '../events/domain-event-bus.service';
import { ProvisioningEngine } from '../provisioning/provisioning.engine';
import { JobCenterService } from '../jobs/job-center.service';
import type { PanelApiResult } from '../panels/panels.service';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PanelsService))
    private panelsService: PanelsService,
    private monitoringService: MonitoringService,
    private lockService: RedisLockService,
    private adminQuota: AdminQuotaService,
    private panelDrivers: PanelDriverRegistry,
    private panelGate: PanelOperationGate,
    @Inject(forwardRef(() => ClientOutputService))
    private clientOutput: ClientOutputService,
    private featureFlags: FeatureFlagsService,
    private policyEngine: PolicyEngine,
    private domainEvents: DomainEventBusService,
    private provisioningEngine: ProvisioningEngine,
    @Optional() private jobs?: JobCenterService,
  ) {}

  /**
   * 3x-ui provision: existing PanelsService path unless adapter_xui_v1 is on.
   */
  private async createOnXuiPanel(
    panelId: string,
    numericIds: number[],
    payload: {
      email: string;
      totalGB?: number;
      expiryTime?: number;
      limitIp?: number;
      limitHwid?: number;
      tgId?: number;
      enable?: boolean;
      flow?: string;
      subId?: string;
      comment?: string;
      reset?: number;
      resetMax?: number;
      trafficReset?: string;
      trafficResetDay?: number;
    },
    callerId?: string,
  ): Promise<PanelApiResult> {
    if (await this.featureFlags.isEnabled(PLATFORM_FLAGS.ADAPTER_XUI_V1)) {
      const driver = this.panelDrivers.get('3x-ui');
      if (driver) {
        try {
          const snap = await this.provisioningEngine.provisionUser({
            panelId,
            panelType: '3x-ui',
            adminId: callerId || '',
            client: {
              username: payload.email,
              inboundIds: numericIds.map(String),
              enable: payload.enable,
              expiryTimeMs: payload.expiryTime,
              limitIp: payload.limitIp,
              totalBytes: BigInt(Math.round((payload.totalGB || 0) * GB)),
              providerExtras: { numericInboundIds: numericIds, payload },
            },
          });
          return { success: true, data: snap };
        } catch (err: any) {
          return {
            success: false,
            error: {
              code: 'UNKNOWN',
              message: err?.message || 'Adapter create failed',
              endpoint: 'ProvisioningEngine.provisionUser',
              durationMs: 0,
            },
          };
        }
      }
    }
    return this.panelsService.createClientOnPanel(
      panelId,
      numericIds,
      payload,
      callerId,
    );
  }

  /** Only admins with unlimitedTraffic (or Super Admin) may own/create unlimited clients. */
  private assertUnlimitedClientAllowed(
    targetAdmin: { unlimitedTraffic?: boolean | null; role?: string | null },
    totalBytes: bigint,
  ): void {
    if (
      totalBytes === 0n &&
      !targetAdmin.unlimitedTraffic &&
      targetAdmin.role !== 'SUPER_ADMIN'
    ) {
      throw new BadRequestException(
        'Only admins with unlimited traffic enabled can create unlimited-traffic clients.',
      );
    }
  }

  /**
   * Enforces the reseller-facing client caps (count / device limit / expiry)
   * that a Super Admin configured on the owning admin, globally or per panel.
   * Super Admins are never capped. Must run before any remote panel call.
   */
  private async assertClientLimitsAllowed(
    targetAdminId: string,
    panelId: string,
    requested: {
      limitIp?: number | null;
      expiryTime?: number | null;
      /** Extra clients this request would create; 0 skips the count check. */
      additionalClients?: number;
    },
  ): Promise<ClientLimitCaps | null> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: targetAdminId },
      select: {
        role: true,
        quotaMode: true,
        maxClients: true,
        maxDeviceLimit: true,
        maxExpireDays: true,
      },
    });
    if (!admin || admin.role === 'SUPER_ADMIN') return null;

    const panelQuota =
      admin.quotaMode === 'PER_PANEL'
        ? await this.prisma.adminPanelQuota.findUnique({
            where: { adminId_panelId: { adminId: targetAdminId, panelId } },
            select: {
              maxClients: true,
              maxDeviceLimit: true,
              maxExpireDays: true,
            },
          })
        : null;

    const caps = resolveClientLimitCaps(admin, panelQuota);

    const additional = requested.additionalClients ?? 0;
    if (caps.maxClients > 0 && additional > 0) {
      const count = await this.prisma.client.count({
        where: { adminId: targetAdminId, panelId },
      });
      if (count + additional > caps.maxClients) {
        throw new BadRequestException(
          `Client limit reached for this panel. Maximum allowed: ${caps.maxClients}. Current: ${count}`,
        );
      }
    }

    if (requested.limitIp !== undefined) {
      assertDeviceLimitAllowed(caps.maxDeviceLimit, requested.limitIp);
    }
    if (requested.expiryTime !== undefined) {
      assertExpireDaysAllowed(caps.maxExpireDays, requested.expiryTime);
    }

    return caps;
  }

  private skipTrafficAccounting(admin: {
    unlimitedTraffic?: boolean | null;
    role?: string | null;
  }): boolean {
    // Super Admin is never traffic-capped — balance/unlimitedTraffic flags
    // only affect display aggregation on the clients overview.
    if (admin.role === 'SUPER_ADMIN') return true;
    return admin.unlimitedTraffic === true;
  }

  /**
   * Whether unused allocation should be refunded when this client is deleted.
   * System-enforced disables (traffic/time/balance) must not refund.
   * Manual disables and active clients refund remaining bytes when eligible.
   */
  private shouldRefundDeletedClient(client: {
    enable: boolean;
    disableReason: string | null;
    total: bigint;
    up: bigint;
    down: bigint;
    expiryTime: bigint;
  }): boolean {
    const reason = client.disableReason;

    // USAGE-mode suspension — refund policy differs from allocation exhaustion
    if (reason === 'BALANCE_EXHAUSTED') {
      return false;
    }

    const used = client.up + client.down;

    if (client.total > 0n && used >= client.total) {
      return false;
    }

    // Legacy rows: disabled with no reason — infer exhaustion from usage/expiry
    if (!client.enable && !reason) {
      if (client.total > 0n && used >= client.total) return false;
      if (client.expiryTime > 0n && BigInt(Date.now()) >= client.expiryTime) {
        return false;
      }
    }

    return true;
  }

  /**
   * A client lives on a single panel, so every selected inbound must belong to
   * the same one. Callers pass inbounds already resolved to their panel.
   */
  private assertSinglePanelInbounds(
    resolvedInbounds: Array<{ panelId: string }>,
  ): void {
    const panelIds = new Set(resolvedInbounds.map((ib) => ib.panelId));
    if (panelIds.size > 1) {
      throw new BadRequestException(
        'All selected inbounds must belong to the same panel. ' +
          'Create a separate client for each panel.',
      );
    }
  }

  /** Net bytes charged to the owner for this client (DEBIT − CREDIT). */
  private async getNetChargedForClient(
    tx: Prisma.TransactionClient,
    clientId: string,
    adminId: string,
  ): Promise<bigint> {
    const [debits, credits] = await Promise.all([
      tx.trafficTransaction.aggregate({
        where: { clientId, adminId, type: 'DEBIT' },
        _sum: { amount: true },
      }),
      tx.trafficTransaction.aggregate({
        where: { clientId, adminId, type: 'CREDIT' },
        _sum: { amount: true },
      }),
    ]);
    const debitSum = debits._sum.amount ?? 0n;
    const creditSum = credits._sum.amount ?? 0n;
    const net = debitSum - creditSum;
    return net > 0n ? net : 0n;
  }

  /** Shared refund path for remove() and sync orphan cleanup. */
  private async applyClientDeletionRefund(
    tx: Prisma.TransactionClient,
    existing: {
      id: string;
      uuid: string;
      email: string;
      adminId: string | null;
      enable: boolean;
      disableReason: string | null;
      total: bigint;
      up: bigint;
      down: bigint;
      expiryTime: bigint;
      createdWithTrafficMode: string | null;
      balanceDeducted: boolean;
      panelId?: string;
      provisioningStatus?: string | null;
    },
    skipRefund: boolean,
  ): Promise<{
    refundGranted: boolean;
    refundedAmount: bigint;
    refundSkippedReason?: string;
  }> {
    let refundGranted = false;
    let refundedAmount = 0n;
    let refundSkippedReason: string | undefined;

    if (skipRefund) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'skipRefund flag',
      };
    }

    if (existing.provisioningStatus === 'FAILED') {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'FAILED client never provisioned',
      };
    }

    if (!existing.adminId) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'no owning admin',
      };
    }

    const wasDeducted = await this.hadTrafficDeducted(tx, {
      id: existing.id,
      uuid: existing.uuid,
      balanceDeducted: existing.balanceDeducted,
      adminId: existing.adminId,
    });
    if (!wasDeducted) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'no prior traffic deduction',
      };
    }

    if (
      !this.shouldRefundDeletedClient({
        enable: existing.enable,
        disableReason: existing.disableReason,
        total: existing.total,
        up: existing.up,
        down: existing.down,
        expiryTime: existing.expiryTime,
      })
    ) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'refund policy declined (quota exhausted)',
      };
    }

    const admin = await tx.admin.findUnique({
      where: { id: existing.adminId },
      select: {
        id: true,
        role: true,
        balance: true,
        totalAssigned: true,
        trafficMode: true,
        unlimitedTraffic: true,
        quotaMode: true,
        refundOnDelete: true,
      },
    });
    if (!admin) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'admin not found',
      };
    }
    if (admin.unlimitedTraffic) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'admin has unlimited traffic',
      };
    }
    if (admin.trafficMode !== 'ALLOCATION') {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'admin not in ALLOCATION mode',
      };
    }

    const allocationEligible =
      existing.createdWithTrafficMode === 'ALLOCATION' ||
      (existing.createdWithTrafficMode == null && wasDeducted);
    if (!allocationEligible) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'client not created under ALLOCATION mode',
      };
    }
    if (!admin.refundOnDelete) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'admin.refundOnDelete disabled',
      };
    }

    const used = existing.up + existing.down;
    const remaining = existing.total - used;
    if (remaining <= 0n) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'no remaining traffic',
      };
    }

    const netCharged = await this.getNetChargedForClient(
      tx,
      existing.id,
      admin.id,
    );
    const refundAmount = remaining < netCharged ? remaining : netCharged;
    if (refundAmount <= 0n) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'net charged balance is zero',
      };
    }

    const existingRefund = await tx.trafficTransaction.findFirst({
      where: {
        action: 'CLIENT_DELETION_REFUND',
        OR: [
          { targetClientUuid: existing.uuid },
          { targetClientUuid: existing.id },
          { clientId: existing.id },
        ],
      },
    });
    if (existingRefund) {
      return {
        refundGranted,
        refundedAmount,
        refundSkippedReason: 'refund already issued',
      };
    }

    await this.adminQuota.credit(
      tx,
      admin as any,
      existing.panelId || null,
      refundAmount,
      {
        clientId: existing.id,
        targetClientUuid: existing.uuid,
        action: 'CLIENT_DELETION_REFUND',
        description: `Client Deletion Refund (${existing.email})`,
      },
    );

    return { refundGranted: true, refundedAmount: refundAmount };
  }

  /**
   * Delete a client already removed from the panel (sync orphan path).
   * Uses the same refund evaluation as remove().
   */
  async deleteOrphanFromSync(client: {
    id: string;
    uuid: string;
    email: string;
    adminId: string | null;
    enable: boolean;
    disableReason: string | null;
    total: bigint;
    up: bigint;
    down: bigint;
    expiryTime: bigint;
    createdWithTrafficMode: string | null;
    balanceDeducted?: boolean | null;
    panelId?: string;
    provisioningStatus?: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const stillExists = await tx.client.findUnique({
        where: { id: client.id },
      });
      if (!stillExists) return;

      const refundResult = await this.applyClientDeletionRefund(
        tx,
        {
          ...client,
          balanceDeducted: client.balanceDeducted === true,
        },
        false,
      );

      await tx.client.delete({ where: { id: client.id } });
      await tx.auditLog.create({
        data: {
          action: 'SYNC_ORPHAN_DELETED',
          entity: 'Client',
          entityId: client.id,
          details: {
            message:
              'Client deleted directly on panel. Removed from DB with refund evaluation.',
            clientEmail: client.email,
            trafficRefunded: refundResult.refundedAmount.toString(),
            refundGranted: refundResult.refundGranted,
            refundSkippedReason: refundResult.refundSkippedReason,
          },
        },
      });
    });
  }

  private async verifyPanelClientQuotaAfterUpdate(
    panelId: string,
    email: string,
    clientPayload: Record<string, unknown>,
    adminId?: string,
  ): Promise<{ verified: boolean; message?: string }> {
    const expected: { totalBytes?: bigint; enable?: boolean } = {};
    if (clientPayload.totalGB !== undefined) {
      expected.totalBytes = BigInt(
        Math.round(Number(clientPayload.totalGB)),
      );
    }
    if (clientPayload.enable !== undefined) {
      expected.enable = Boolean(clientPayload.enable);
    }
    if (expected.totalBytes === undefined && expected.enable === undefined) {
      return { verified: true };
    }
    return this.panelsService.verifyClientPanelState(
      panelId,
      email,
      expected,
      adminId,
    );
  }

  /** True when traffic was deducted from the owning admin for this client. */
  private async hadTrafficDeducted(
    tx: Prisma.TransactionClient,
    client: {
      id: string;
      uuid: string;
      balanceDeducted: boolean;
      adminId: string | null;
    },
  ): Promise<boolean> {
    if (client.balanceDeducted) return true;
    if (!client.adminId) return false;

    const debit = await tx.trafficTransaction.findFirst({
      where: {
        adminId: client.adminId,
        type: 'DEBIT',
        OR: [
          { targetClientUuid: client.uuid },
          { targetClientUuid: client.id },
          { clientId: client.id },
        ],
      },
    });
    return !!debit;
  }

  private async executeAtomicOperation(
    adminId: string | null,
    entityId: string,
    entityType: string,
    operationName: string,
    payload: any,
    task: (opId: string) => Promise<{ verified: boolean; message?: string }>,
    onSuccess: (tx: any) => Promise<any>,
  ) {
    const op = await this.prisma.operationQueue.create({
      data: {
        adminId,
        entityId,
        entityType,
        operation: operationName,
        payload,
        status: 'RUNNING',
      },
    });

    try {
      const result = await task(op.id);

      if (!result.verified) {
        await this.prisma.operationQueue.update({
          where: { id: op.id },
          data: {
            status: 'FAILED',
            errorLog: result.message || 'Verification failed on panel',
          },
        });
        throw new BadRequestException(
          `Operation failed verification: ${result.message || 'State mismatch'}`,
        );
      }

      const txResult = await this.prisma.$transaction(async (tx) => {
        return await onSuccess(tx);
      });

      await this.prisma.operationQueue.update({
        where: { id: op.id },
        data: { status: 'SUCCESS' },
      });

      return txResult;
    } catch (err: any) {
      await this.prisma.operationQueue.update({
        where: { id: op.id },
        data: { status: 'FAILED', errorLog: err.message },
      });
      throw err;
    }
  }

  private async createOnExternalPanel(
    callerId: string,
    data: {
      email: string;
      inboundIds: string[];
      remark?: string;
      total?: number;
      expiryTime?: number;
      adminId?: string;
      limitIp?: number;
      providerExtras?: Record<string, unknown>;
    },
    inbounds: Array<{
      id: string;
      panelId: string;
      panel: any;
      remoteResourceId?: string | null;
      panelInboundId?: number | null;
    }>,
  ) {
    const panel = inbounds[0].panel;
    await this.panelGate.assertCanOperate(panel);
    const driver = this.panelDrivers.get(panel.panelType);
    if (!driver) {
      throw new BadRequestException('Premium unavailable — this panel is frozen.');
    }

    const caller = await this.prisma.admin.findUnique({
      where: { id: callerId },
      include: { _count: { select: { clients: true } } },
    });
    if (!caller) throw new BadRequestException('Admin not found');

    let targetAdminId = callerId;
    let targetAdmin = caller;
    if (caller.role === 'SUPER_ADMIN' && data.adminId) {
      targetAdminId = data.adminId;
      const explicitTarget = await this.prisma.admin.findUnique({
        where: { id: targetAdminId },
        include: { _count: { select: { clients: true } } },
      });
      if (!explicitTarget) throw new BadRequestException('Target Admin not found');
      targetAdmin = explicitTarget;
    }

    const totalBytes = BigInt(data.total || 0);
    this.assertUnlimitedClientAllowed(targetAdmin, totalBytes);
    if (targetAdmin.maxClients > 0 && targetAdmin._count.clients >= targetAdmin.maxClients) {
      throw new BadRequestException(
        `Client limit reached. Maximum allowed: ${targetAdmin.maxClients}`,
      );
    }
    await this.assertClientLimitsAllowed(targetAdminId, panel.id, {
      limitIp: data.limitIp ?? 0,
      expiryTime: data.expiryTime ?? 0,
      additionalClients: 1,
    });

    const clash = await this.prisma.client.findUnique({
      where: { panelId_email: { panelId: panel.id, email: data.email } },
    });
    if (clash) {
      throw new BadRequestException(`Email "${data.email}" is already in use on a selected panel.`);
    }

    if (caller.role !== 'SUPER_ADMIN' && !this.skipTrafficAccounting(caller)) {
      const callerCtx = await this.adminQuota.loadAdmin(callerId);
      const accountingMode = await this.adminQuota.resolveTrafficMode(
        callerId,
        panel.panelType,
      );
      await this.adminQuota.assertCanAllocate(callerCtx, totalBytes, panel.id, {
        usageMode: accountingMode === 'USAGE',
      });
    }

    const ownerTrafficMode = await this.adminQuota.resolveTrafficMode(
      targetAdminId,
      panel.panelType,
    );

    const providerExtras =
      panel.panelType === 'pasarguard'
        ? extrasForPasarguard(data.providerExtras, inbounds, data.limitIp)
        : data.providerExtras;

    let remote;
    try {
      remote = await driver.createClient(panel.id, {
        username: data.email,
        totalBytes,
        expiryTimeMs: data.expiryTime || 0,
        enable: true,
        remark: data.remark,
        limitIp: data.limitIp,
        inboundIds: data.inboundIds,
        resourceIds: inbounds.map((i) => i.remoteResourceId || String(i.panelInboundId || i.id)),
        providerExtras,
      });
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Remote create failed');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const lockedCaller = await tx.admin.findUnique({ where: { id: callerId } });
        if (!lockedCaller) throw new BadRequestException('Admin not found');
        const callerCtx = await this.adminQuota.loadAdmin(callerId, tx);
        const uuid = remote.uuid || snapshotToClientUuid(panel.panelType, data.email);
        const client = await tx.client.create({
          data: {
            panelId: panel.id,
            adminId: targetAdminId,
            email: data.email,
            remark: data.remark,
            uuid,
            remoteUsername: remote.username || data.email,
            providerMeta: mapSnapshotMeta(remote),
            lastSyncedAt: new Date(),
            syncStale: false,
            subToken: require('crypto').randomBytes(5).toString('hex'),
            enable: remote.enable,
            total: remote.total || totalBytes,
            expiryTime: remote.expiryTime || BigInt(data.expiryTime || 0),
            up: remote.up || 0n,
            down: remote.down || 0n,
            limitIp: remote.limitIp ?? data.limitIp ?? 0,
            createdWithTrafficMode: ownerTrafficMode,
            provisioningStatus: 'ACTIVE',
            provisionedAt: new Date(),
            balanceDeducted:
              totalBytes > 0n &&
              lockedCaller.role !== 'SUPER_ADMIN' &&
              !this.skipTrafficAccounting(lockedCaller) &&
              ownerTrafficMode === 'ALLOCATION',
            inbounds: { create: data.inboundIds.map((inboundId) => ({ inboundId })) },
          },
          include: {
            inbounds: {
              select: {
                inbound: {
                  select: {
                    id: true,
                    tag: true,
                    port: true,
                    protocol: true,
                    panel: { select: { id: true, name: true, url: true, subUrl: true, panelType: true } },
                  },
                },
              },
            },
          },
        });

        if (
          totalBytes > 0n &&
          lockedCaller.role !== 'SUPER_ADMIN' &&
          !this.skipTrafficAccounting(lockedCaller) &&
          ownerTrafficMode === 'ALLOCATION'
        ) {
          await this.adminQuota.debit(tx, callerCtx, panel.id, totalBytes, {
            clientId: client.id,
            targetClientUuid: client.uuid,
            action: `CLIENT_CREATION_ALLOCATION_${Date.now()}`,
            description: 'Client Creation Allocation',
          });
        }

        return {
          ...client,
          inbound: client.inbounds?.[0]?.inbound || null,
          inbounds: client.inbounds?.map((ci) => ci.inbound) || [],
        };
      });
    } catch (err) {
      await driver.deleteClient(panel.id, data.email).catch(() => {});
      throw err;
    }
  }

  private async updateOnExternalPanel(
    id: string,
    adminId: string,
    role: string,
    data: {
      enable?: boolean;
      total?: number;
      expiryTime?: number;
      remark?: string;
      inboundIds?: string[];
      limitIp?: number;
      providerExtras?: Record<string, unknown>;
    },
    existing: any,
  ) {
    const panel = existing.inbound?.panel || existing.inbounds?.[0]?.panel;
    await this.panelGate.assertCanOperate(panel);
    const driver = this.panelDrivers.get(panel.panelType);
    if (!driver) {
      throw new BadRequestException('Premium unavailable — this panel is frozen.');
    }
    if (
      existing.adminId &&
      (data.limitIp !== undefined || data.expiryTime !== undefined)
    ) {
      await this.assertClientLimitsAllowed(
        existing.adminId,
        existing.panelId || panel.id,
        {
          ...(data.limitIp !== undefined ? { limitIp: data.limitIp } : {}),
          ...(data.expiryTime !== undefined
            ? { expiryTime: data.expiryTime }
            : {}),
        },
      );
    }

    const username = existing.remoteUsername || existing.email;
    let providerExtras = data.providerExtras;
    if (panel.panelType === 'pasarguard') {
      const inboundIds = data.inboundIds?.length
        ? data.inboundIds
        : (existing.inbounds || []).map((i: any) => i.id).filter(Boolean);
      const inboundRows = inboundIds.length
        ? await this.prisma.inbound.findMany({
            where: { id: { in: inboundIds } },
            select: { remoteResourceId: true, panelInboundId: true },
          })
        : [];
      providerExtras = extrasForPasarguard(data.providerExtras, inboundRows, data.limitIp);
    }
    const remote = await driver.updateClient(panel.id, username, {
      totalBytes: data.total !== undefined ? BigInt(data.total) : undefined,
      expiryTimeMs: data.expiryTime,
      enable: data.enable,
      remark: data.remark,
      limitIp: data.limitIp,
      inboundIds: data.inboundIds,
      providerExtras,
    });
    const previousAllocation = BigInt(existing.total || 0);
    const newAllocation =
      data.total !== undefined ? BigInt(data.total) : previousAllocation;
    const diff = newAllocation - previousAllocation;
    const quotaPanelId = existing.panelId || panel.id;

    await this.prisma.$transaction(async (tx) => {
      if (data.total !== undefined && diff !== 0n && existing.adminId) {
        const owner = await tx.admin.findUnique({
          where: { id: existing.adminId },
          select: {
            id: true,
            role: true,
            balance: true,
            totalAssigned: true,
            trafficMode: true,
            unlimitedTraffic: true,
            quotaMode: true,
            refundOnEdit: true,
          },
        });
        const skipOwnerAccounting =
          role === 'SUPER_ADMIN' || this.skipTrafficAccounting(owner ?? {});
        const ownerMode = owner
          ? await this.adminQuota.resolveTrafficMode(
              owner.id,
              panel.panelType,
              tx,
            )
          : 'ALLOCATION';
        if (owner && !skipOwnerAccounting && ownerMode === 'ALLOCATION') {
          if (diff > 0n) {
            await this.adminQuota.assertCanAllocate(
              owner as any,
              diff,
              quotaPanelId,
            );
            await this.adminQuota.debit(tx, owner as any, quotaPanelId, diff, {
              clientId: id,
              targetClientUuid: existing.uuid,
              action: `CLIENT_TRAFFIC_INCREASE_${Date.now()}`,
              description: 'Client Traffic Increase',
            });
          } else if (diff < 0n && owner.refundOnEdit) {
            await this.adminQuota.credit(
              tx,
              owner as any,
              quotaPanelId,
              -diff,
              {
                clientId: id,
                targetClientUuid: existing.uuid,
                action: `CLIENT_TRAFFIC_DECREASE_${Date.now()}`,
                description: 'Client Traffic Decrease',
              },
            );
          }
        }
      }

      await tx.client.update({
        where: { id },
        data: {
          enable: data.enable ?? remote.enable,
          remark: data.remark ?? existing.remark,
          total: data.total !== undefined ? newAllocation : existing.total,
          expiryTime:
            data.expiryTime !== undefined
              ? BigInt(data.expiryTime)
              : existing.expiryTime,
          limitIp: remote.limitIp ?? data.limitIp ?? existing.limitIp,
          providerMeta: mapSnapshotMeta(remote),
          lastSyncedAt: new Date(),
          syncStale: false,
          ...(diff > 0n ? { balanceDeducted: true } : {}),
          ...(data.inboundIds
            ? {
                inbounds: {
                  deleteMany: {},
                  create: data.inboundIds.map((inboundId) => ({ inboundId })),
                },
              }
            : {}),
        },
      });
    });
    return this.findOne(id, adminId, role);
  }

  private async removeOnExternalPanel(
    id: string,
    adminId: string,
    role: string,
    skipRefund: boolean,
    existing: any,
  ) {
    const panel = existing.inbound?.panel || existing.inbounds?.[0]?.panel;
    await this.panelGate.assertCanOperate(panel);
    const driver = this.panelDrivers.get(panel.panelType);
    if (!driver) {
      throw new BadRequestException('Premium unavailable — this panel is frozen.');
    }
    const username = existing.remoteUsername || existing.email;
    try {
      await driver.deleteClient(panel.id, username);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (!/not found|404|does not exist/i.test(msg)) {
        throw new BadRequestException(msg || 'Remote delete failed');
      }
    }

    const remainingRaw =
      BigInt(existing.total || 0) -
      BigInt(existing.up || 0) -
      BigInt(existing.down || 0);
    const remaining = remainingRaw > 0n ? remainingRaw : 0n;
    const refund =
      !skipRefund &&
      remaining > 0n &&
      existing.balanceDeducted &&
      this.shouldRefundDeletedClient(existing);

    await this.prisma.$transaction(async (tx) => {
      if (refund && existing.adminId) {
        const owner = await this.adminQuota.loadAdmin(existing.adminId, tx);
        await this.adminQuota.credit(tx, owner, existing.panelId, remaining, {
          clientId: existing.id,
          targetClientUuid: existing.uuid,
          action: `CLIENT_DELETE_REFUND_${Date.now()}`,
          description: 'Client deletion refund',
        });
      }
      await tx.clientInbound.deleteMany({ where: { clientId: id } });
      await tx.client.delete({ where: { id } });
    });
    return { ok: true };
  }

  async create(
    callerId: string,
    data: {
      email: string;
      inboundIds: string[];
      remark?: string;
      total?: number;
      expiryTime?: number;
      flow?: string;
      adminId?: string;
      limitIp?: number;
      /** When set, maps to 3x-ui trafficReset (3.7+) / reset interval. */
      trafficReset?: string;
      trafficResetDay?: number;
      reset?: number;
      resetMax?: number;
      providerExtras?: Record<string, unknown>;
    },
  ) {
    if (data.email) data.email = data.email.trim();
    const totalBytes = BigInt(data.total || 0);
    const clientUuid = randomUUID();
    const lockKey = `client:create:${data.email}`;

    // Acquire lock
    this.logger.log(`[LOCK] Acquire lock: email=${data.email}`);
    const locked = await this.lockService.acquireLock(lockKey, 30000);
    if (!locked) {
      this.logger.warn(`[LOCK] Already exists: email=${data.email}`);
      throw new BadRequestException(
        'A client creation operation is already in progress for this email.',
      );
    }

    let reservation: { id: string } | null = null;
    try {
      // ── Step 1: Validate inputs ──────────────────────────────────────────────
      if (!data.inboundIds || data.inboundIds.length === 0) {
        throw new BadRequestException('At least one inbound must be selected');
      }

      const inbounds = await this.prisma.inbound.findMany({
        where: { id: { in: data.inboundIds } },
        include: { panel: true },
      });
      if (!inbounds || inbounds.length === 0)
        throw new BadRequestException('No valid inbounds found');

      const externalTypes = new Set(
        inbounds.map((i) => i.panel?.panelType).filter((t) => isExternalPanelType(t)),
      );
      if (externalTypes.size > 0) {
        if (externalTypes.size > 1) {
          throw new BadRequestException('Cannot mix Eylan and Pasarguard inbounds on one client');
        }
        if (inbounds.some((i) => !isExternalPanelType(i.panel?.panelType))) {
          throw new BadRequestException('Cannot mix 3x-ui and external panel inbounds');
        }
        return this.createOnExternalPanel(callerId, data, inbounds);
      }

      const caller = await this.prisma.admin.findUnique({
        where: { id: callerId },
        include: { _count: { select: { clients: true } } },
      });
      if (!caller) throw new BadRequestException('Admin not found');

      let targetAdminId = callerId;
      let targetAdmin = caller;

      if (caller.role === 'SUPER_ADMIN' && data.adminId) {
        targetAdminId = data.adminId;
        const explicitTarget = await this.prisma.admin.findUnique({
          where: { id: targetAdminId },
          include: { _count: { select: { clients: true } } },
        });
        if (!explicitTarget)
          throw new BadRequestException('Target Admin not found');
        targetAdmin = explicitTarget;
      }

      this.assertUnlimitedClientAllowed(targetAdmin, totalBytes);

      if (caller.role === 'SUPER_ADMIN' && totalBytes === 0n) {
        this.assertUnlimitedClientAllowed(targetAdmin, totalBytes);
      }

      if (await this.featureFlags.isEnabled(PLATFORM_FLAGS.POLICY_RESERVE_V1)) {
        reservation = await this.policyEngine.reserve({
          adminId: targetAdmin.id,
          operation: 'CREATE_USER',
          maxClients: targetAdmin.maxClients,
          currentClients: targetAdmin._count.clients,
          trafficBytes: totalBytes,
          unlimitedTraffic: !!targetAdmin.unlimitedTraffic,
          role: targetAdmin.role,
          persist: true,
        });
      } else if (
        targetAdmin.maxClients > 0 &&
        targetAdmin._count.clients >= targetAdmin.maxClients
      ) {
        throw new BadRequestException(
          `Client limit reached. Maximum allowed: ${targetAdmin.maxClients}`,
        );
      }

      // ── Step 2: Resolve numeric panel inbound IDs ────────────────────────────
      // The native /clients/add endpoint requires numeric (integer) inbound IDs
      // from the 3x-ui panel DB. These are stored in panelInboundId after sync.
      const resolvedInbounds =
        await this.panelsService.resolveNumericInboundIds(data.inboundIds);

      // A client belongs to exactly one panel (Client.panelId) — update() also
      // rejects inbounds from another panel, so creation must match.
      this.assertSinglePanelInbounds(resolvedInbounds);

      const byPanel = new Map<
        string,
        { dbIds: string[]; numericIds: number[] }
      >();
      for (const ib of resolvedInbounds) {
        if (!byPanel.has(ib.panelId))
          byPanel.set(ib.panelId, { dbIds: [], numericIds: [] });
        byPanel.get(ib.panelId)!.dbIds.push(ib.id);
        byPanel.get(ib.panelId)!.numericIds.push(ib.panelInboundId);
      }

      const targetPanelId = [...byPanel.keys()][0];

      await this.assertClientLimitsAllowed(targetAdminId, targetPanelId, {
        limitIp: data.limitIp ?? 0,
        expiryTime: data.expiryTime ?? 0,
        additionalClients: 1,
      });

      if (caller.role !== 'SUPER_ADMIN') {
        const callerSkipsTraffic = this.skipTrafficAccounting(caller);
        if (!callerSkipsTraffic) {
          const callerCtx = await this.adminQuota.loadAdmin(callerId);
          const bucket = await this.adminQuota.getPanelBalance(
            callerCtx,
            targetPanelId,
          );
          if (bucket.balance > 0 && totalBytes === 0n) {
            throw new BadRequestException(
              'Cannot create an unlimited client when your account has a traffic limit.',
            );
          }
          await this.adminQuota.assertCanAllocate(
            callerCtx,
            totalBytes,
            targetPanelId,
            { usageMode: caller.trafficMode === 'USAGE' },
          );
        }
      }

      for (const [panelId] of byPanel) {
        const existingClient = await this.prisma.client.findUnique({
          where: { panelId_email: { panelId, email: data.email } },
        });
        if (existingClient)
          throw new BadRequestException(
            `Email "${data.email}" is already in use on a selected panel.`,
          );
      }

      // Prepare panel-specific payloads
      const panelPayloads = new Map<string, any>();
      const clientSubId = require('crypto').randomBytes(8).toString('hex');

      for (const [panelId, { numericIds }] of byPanel) {
        const panel = inbounds.find((i) => i.panelId === panelId)?.panel;
        const limits = resolve3xUiLimit(
          {
            apiVersion: panel?.apiVersion,
            capabilities: panel?.capabilities,
          },
          data.limitIp,
        );
        const clientUuid = randomUUID();
        const clientSubToken = require('crypto').randomBytes(5).toString('hex');
        const payload: Record<string, unknown> = {
          id: clientUuid,
          email: data.email,
          totalGB: Number(data.total) || 0,
          expiryTime: data.expiryTime || 0,
          limitIp: limits.limitIp,
          limitHwid: limits.limitHwid,
          tgId: 0,
          enable: true,
          flow: data.flow || '',
          subId: clientSubId,
          comment: '',
          reset: data.reset ?? 0,
        };
        if (data.trafficReset && data.trafficReset !== 'never') {
          payload.trafficReset = data.trafficReset;
          if (data.trafficResetDay) payload.trafficResetDay = data.trafficResetDay;
        }
        if (data.resetMax != null) payload.resetMax = data.resetMax;
        panelPayloads.set(panelId, {
          uuid: clientUuid,
          subToken: clientSubToken,
          payload,
        });
      }

      // ── Step 3: PRE-FLIGHT CHECK ON REMOTE PANELS ────────────────────────────
      for (const [panelId] of byPanel) {
        const existCheck = await this.panelsService.verifyClientExists(
          panelId,
          data.email,
          callerId,
        );
        if (existCheck.exists) {
          throw new BadRequestException(
            `Email "${data.email}" already exists on remote panel. Creation aborted.`,
          );
        }
      }

      // ── Step 4: PANEL FIRST — create on every panel, strictly verify ─────────
      // No DB records are written until ALL panels confirm success.
      const createdOnPanels: string[] = []; // panelIds successfully provisioned

      for (const [panelId, { numericIds }] of byPanel) {
        const pData = panelPayloads.get(panelId)!;
        // 3a. Create on panel
        const createResult = await this.createOnXuiPanel(
          panelId,
          numericIds,
          pData.payload,
          callerId,
        );

        if (!createResult.success) {
          // Rollback panels already created
          for (const donePanel of createdOnPanels) {
            await this.panelsService
              .deleteClientOnPanel(donePanel, data.email, callerId, true)
              .catch((e) => {});
          }
          const err = createResult.error!;
          throw new BadRequestException(
            `Failed to provision client on panel: ${err.message}` +
              (err.code !== 'UNKNOWN' ? ` [${err.code}]` : ''),
          );
        }

        // 4b. Strict verification
        const verifyResult = await this.panelsService.verifyClientExists(
          panelId,
          data.email,
          callerId,
        );
        let isVerified = false;
        let verificationReason = 'Client verification failed.';

        if (
          verifyResult.exists &&
          verifyResult.data &&
          verifyResult.inboundIds
        ) {
          const remoteClientObj = verifyResult.data.client || verifyResult.data;

          const remoteInbounds = [...verifyResult.inboundIds].sort();
          const expectedInbounds = [...numericIds].sort();

          const inboundsMatch =
            remoteInbounds.length === expectedInbounds.length &&
            remoteInbounds.every(
              (val, index) => val === expectedInbounds[index],
            );

          const fieldsMatch =
            remoteClientObj.email === data.email &&
            remoteClientObj.uuid === pData.uuid &&
            remoteClientObj.enable === true;

          if (!inboundsMatch) {
            verificationReason = `Inbound mismatch. Expected [${expectedInbounds.join(',')}] but got [${remoteInbounds.join(',')}].`;
          } else if (!fieldsMatch) {
            verificationReason = `Client field validation failed. Missing or mismatched email, uuid, or enable status.`;
          } else {
            isVerified = true;
          }
        } else {
          verificationReason = !verifyResult.exists
            ? `Panel did not confirm existence.`
            : `Missing inboundIds or client object in response.`;
        }

        if (!isVerified) {
          // Strict Rollback
          for (const donePanel of [...createdOnPanels, panelId]) {
            await this.panelsService
              .deleteClientOnPanel(donePanel, data.email, callerId, true)
              .catch(() => {});
          }
          throw new BadRequestException(
            `Strict Provisioning verification failed: ${verificationReason} Operation completely rolled back.`,
          );
        }

        createdOnPanels.push(panelId);
      }

      // ── Step 5: Assign to reseller group (advisory) ────────────────────────
      for (const [panelId] of byPanel) {
        await this.panelsService
          .assignClientToGroup(panelId, [data.email], targetAdmin.username)
          .catch(() => {});
      }

      // ── Step 5: DB COMMIT — only now that panel is source of truth ───────────
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          // Re-lock caller balance inside transaction
          const lockedCaller = await tx.admin.findUnique({
            where: { id: callerId },
          });
          if (!lockedCaller) throw new BadRequestException('Admin not found');

          const callerCtx = await this.adminQuota.loadAdmin(callerId, tx);
          if (
            lockedCaller.role !== 'SUPER_ADMIN' &&
            !this.skipTrafficAccounting(lockedCaller)
          ) {
            await this.adminQuota.assertCanAllocate(
              callerCtx,
              totalBytes,
              targetPanelId,
              { usageMode: lockedCaller.trafficMode === 'USAGE' },
            );
          }

          const createdClients = [];
          for (const [panelId, { dbIds }] of byPanel) {
            const pData = panelPayloads.get(panelId)!;
            const client = await tx.client.create({
              data: {
                panelId,
                adminId: targetAdminId,
                email: data.email,
                remark: data.remark,
                uuid: pData.uuid,
                subId: clientSubId,
                subToken: pData.subToken,
                flow: data.flow,
                total: totalBytes,
                expiryTime: BigInt(data.expiryTime || 0),
                limitIp: data.limitIp || 0,
                createdWithTrafficMode: targetAdmin.trafficMode,
                provisioningStatus: 'ACTIVE',
                provisionedAt: new Date(),
                balanceDeducted:
                  totalBytes > 0n &&
                  lockedCaller.role !== 'SUPER_ADMIN' &&
                  !this.skipTrafficAccounting(lockedCaller) &&
                  lockedCaller.trafficMode === 'ALLOCATION',
                inbounds: {
                  create: dbIds.map((inboundId) => ({ inboundId })),
                },
              },
              include: {
                inbounds: {
                  select: {
                    inbound: {
                      select: {
                        id: true,
                        tag: true,
                        port: true,
                        protocol: true,
                        panel: {
                          select: {
                            id: true,
                            name: true,
                            url: true,
                            subUrl: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            });
            createdClients.push(client);
          }

          if (
            totalBytes > 0n &&
            lockedCaller.role !== 'SUPER_ADMIN' &&
            !this.skipTrafficAccounting(lockedCaller) &&
            lockedCaller.trafficMode === 'ALLOCATION'
          ) {
            await this.adminQuota.debit(
              tx,
              callerCtx,
              targetPanelId,
              totalBytes,
              {
                clientId: createdClients[0].id,
                targetClientUuid: createdClients[0].uuid,
                action: `CLIENT_CREATION_ALLOCATION_${Date.now()}`,
                description: 'Client Creation Allocation',
              },
            );
          }

          await tx.auditLog.create({
            data: {
              action: 'CLIENT_CREATED',
              entity: 'Client',
              entityId: createdClients[0].id,
              adminId: callerId,
              details: { targetAdminId, panelsProvisioned: createdOnPanels },
            },
          });

          return {
            ...createdClients[0],
            inbound: createdClients[0].inbounds?.[0]?.inbound || null,
            inbounds: createdClients.flatMap(
              (c) => c.inbounds?.map((ci) => ci.inbound) || [],
            ),
          };
        });
        await this.policyEngine.commit(reservation?.id);
        await this.domainEvents.emit('client.created', {
          email: data.email,
          adminId: targetAdminId,
        });
        return created;
      } catch (dbError: any) {
        // Ultimate fallback rollback if database transaction crashes
        for (const donePanel of createdOnPanels) {
          await this.panelsService
            .deleteClientOnPanel(donePanel, data.email, callerId, true)
            .catch(() => {});
        }
        throw new BadRequestException(
          `Database synchronization failed. Remote panels have been rolled back. Error: ${dbError.message}`,
        );
      }
    } catch (err) {
      await this.policyEngine.rollback(reservation?.id);
      throw err;
    } finally {
      // Always release lock
      this.logger.log(`[LOCK] Released: email=${data.email}`);
      await this.lockService.releaseLock(lockKey);
    }
  }

  async findAll(
    adminId: string,
    role: string,
    page = 1,
    limit = 50,
    filters: ClientFilters = {},
  ) {
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

    if (filters.search)
      where.email = { contains: filters.search, mode: 'insensitive' };
    if (filters.inboundId) {
      where.inbounds = {
        some: {
          inboundId: filters.inboundId,
        },
      };
    }
    const typeTab =
      (isNativePanelTypeFilter(filters.panelId) && filters.panelId) ||
      (isNativePanelTypeFilter(filters.panelType) && filters.panelType) ||
      '';
    if (typeTab) {
      // Eylan/Pasarguard type tabs: all clients on panels of that type.
      // Native rows are keyed by Client.panelId, not always by inbound join.
      where.panel = { panelType: typeTab };
    } else if (filters.panelType === '3x-ui' || filters.panelId === '3x-ui' || filters.panelId === '3xui') {
      where.panel = { NOT: { panelType: { in: [...NATIVE_PANEL_TYPES] } } };
    } else if (filters.panelId) {
      where.panelId = filters.panelId;
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
      const rawIds = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Client"
        WHERE total > 0 AND (up + down) < total AND ((up + down)::float / total::float) >= 0.8
        ${role !== 'SUPER_ADMIN' ? Prisma.sql`AND "adminId" = ${adminId}` : Prisma.empty}
      `;
      where.id = { in: rawIds.map((r) => r.id) };
    } else if (filters.status === 'depleted') {
      const rawIds = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Client"
        WHERE total > 0 AND (up + down) >= total
        ${role !== 'SUPER_ADMIN' ? Prisma.sql`AND "adminId" = ${adminId}` : Prisma.empty}
      `;
      where.id = { in: rawIds.map((r) => r.id) };
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
          id: true,
          email: true,
          remark: true,
          ownerTag: true,
          uuid: true,
          subId: true,
          enable: true,
          flow: true,
          limitIp: true,
          up: true,
          down: true,
          total: true,
          expiryTime: true,
          createdAt: true,
          admin: { select: { id: true, username: true } },
          panel: { select: { id: true, name: true, url: true, subUrl: true, panelType: true } },
          inbounds: {
            select: {
              inbound: {
                select: {
                  id: true,
                  tag: true,
                  port: true,
                  protocol: true,
                  streamSettings: true,
                  panel: {
                  select: {
                    id: true,
                    name: true,
                    url: true,
                    subUrl: true,
                    panelType: true,
                    nativeCapabilities: true,
                    connectionHealth: true,
                    lastSync: true,
                  },
                },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    const mappedData = data.map((client) => ({
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map((ci) => ci.inbound) || [],
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
                panel: {
                  select: {
                    id: true,
                    name: true,
                    url: true,
                    subUrl: true,
                    panelType: true,
                    nativeCapabilities: true,
                    connectionHealth: true,
                    lastSync: true,
                    lastSyncError: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (role !== 'SUPER_ADMIN' && client.adminId !== adminId)
      throw new ForbiddenException();

    return {
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map((ci) => ci.inbound) || [],
    };
  }

  async getQrCode(id: string, adminId: string, role: string) {
    await this.findOne(id, adminId, role);
    const output = await this.clientOutput.getOutputByClientId(id);
    const subUrl = String(
      output.payload?.qrText ||
        output.payload?.systemSubUrl ||
        output.payload?.nativeSubUrl ||
        '',
    ).trim();
    if (!subUrl) {
      throw new BadRequestException('Panel subscription URL is not configured');
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(subUrl, {
        width: 300,
        margin: 2,
      });
      return { qrCode: qrDataUrl };
    } catch (e) {
      throw new BadRequestException('Failed to generate QR code');
    }
  }
  private async syncInboundAssignmentsOnPanel(
    panelId: string,
    email: string,
    newNumericInboundIds: number[] | null,
    clientPayload: any,
    adminId?: string,
  ): Promise<{ verified: boolean; message?: string }> {
    if (newNumericInboundIds === null) {
      // If we are not changing inbounds, just update directly without strict matching
      const updateResult = await this.panelsService.updateClientOnPanel(
        panelId,
        email,
        clientPayload,
        adminId,
      );
      if (!updateResult.success) {
        return {
          verified: false,
          message: `Panel update failed: ${updateResult.error?.message}`,
        };
      }
      return this.verifyPanelClientQuotaAfterUpdate(
        panelId,
        email,
        clientPayload,
        adminId,
      );
    }

    // ── Step 1: PRE-FLIGHT — verify the client still exists on the panel ──
    this.logger.log(
      `[SYNC_INBOUNDS] Pre-flight: verifying client ${email} exists on panel ${panelId}`,
    );
    const preCheck = await this.panelsService.verifyClientExists(
      panelId,
      email,
      adminId,
    );
    if (!preCheck.exists) {
      this.logger.error(
        `[SYNC_INBOUNDS] ABORT: Client ${email} does NOT exist on panel ${panelId}. ` +
          `Cannot update a client that has been removed from the panel.`,
      );
      return {
        verified: false,
        message: `Client "${email}" does not exist on the remote panel. Update aborted. No changes were made.`,
      };
    }

    // ── Step 2: Calculate Differences and Apply Attach/Detach ──────────────
    const remoteInbounds = (preCheck.inboundIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const desiredInbounds = newNumericInboundIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const remoteSet = new Set(remoteInbounds);
    const desiredSet = new Set(desiredInbounds);
    const toAttach = desiredInbounds.filter((id) => !remoteSet.has(id));
    const toDetach = remoteInbounds.filter((id) => !desiredSet.has(id));

    if (toAttach.length === 0 && toDetach.length === 0) {
      this.logger.log(
        `[SYNC_INBOUNDS] Inbound set already matches for ${email}; skipping attach/detach`,
      );
    }

    if (toDetach.length > 0) {
      this.logger.log(
        `[SYNC_INBOUNDS] Detaching inbounds [${toDetach.join(',')}] from client ${email}`,
      );
      const detachResult = await this.panelsService.detachInboundsFromClient(
        panelId,
        email,
        toDetach,
        adminId,
      );
      if (!detachResult.success) {
        this.logger.error(
          `[SYNC_INBOUNDS] Detach FAILED for ${email}: ${detachResult.error?.message}`,
        );
        return {
          verified: false,
          message: `Panel detach failed: ${detachResult.error?.message}`,
        };
      }
    }

    if (toAttach.length > 0) {
      this.logger.log(
        `[SYNC_INBOUNDS] Attaching inbounds [${toAttach.join(',')}] to client ${email}`,
      );
      const attachResult = await this.panelsService.attachInboundsToClient(
        panelId,
        email,
        toAttach,
        adminId,
      );
      if (!attachResult.success) {
        this.logger.error(
          `[SYNC_INBOUNDS] Attach FAILED for ${email}: ${attachResult.error?.message}`,
        );
        return {
          verified: false,
          message: `Panel attach failed: ${attachResult.error?.message}`,
        };
      }
    }

    // Always update the client payload (fields like enable, expiryTime, totalGB)
    // The updateClientOnPanel method now strips inboundIds from its payload
    const updateResult = await this.panelsService.updateClientOnPanel(
      panelId,
      email,
      clientPayload,
      adminId,
    );

    if (!updateResult.success) {
      this.logger.error(
        `[SYNC_INBOUNDS] Panel update FAILED for ${email}: ${updateResult.error?.message}`,
      );
      return {
        verified: false,
        message: `Panel update failed: ${updateResult.error?.message}`,
      };
    }

    // ── Step 3: POST-UPDATE VERIFICATION ──────────────────────────────────
    const postCheck = await this.panelsService.verifyClientExists(
      panelId,
      email,
      adminId,
    );
    if (!postCheck.exists) {
      this.logger.error(
        `[SYNC_INBOUNDS] CRITICAL: Client ${email} MISSING after update!`,
      );
      return {
        verified: false,
        message: `Client "${email}" disappeared from the panel after update.`,
      };
    }

    const postRemoteInbounds = [...(postCheck.inboundIds || [])]
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .sort((a, b) => a - b);
    const expectedInbounds = [...desiredInbounds].sort((a, b) => a - b);

    const inboundsMatch =
      postRemoteInbounds.length === expectedInbounds.length &&
      postRemoteInbounds.every((val, index) => val === expectedInbounds[index]);

    if (!inboundsMatch) {
      const errMsg = `Inbound mismatch after update for ${email}. Expected [${expectedInbounds.join(',')}] but got [${postRemoteInbounds.join(',')}].`;
      this.logger.error(
        `[SYNC_INBOUNDS] VERIFICATION FAILED: ${errMsg} Triggering rollback.`,
      );
      return { verified: false, message: errMsg }; // STICT VERIFICATION: This fails the operation
    }

    const quotaVerify = await this.verifyPanelClientQuotaAfterUpdate(
      panelId,
      email,
      clientPayload,
      adminId,
    );
    if (!quotaVerify.verified) {
      return quotaVerify;
    }

    this.logger.log(`[SYNC_INBOUNDS] Verification passed for ${email}.`);
    return { verified: true };
  }

  async update(
    id: string,
    adminId: string,
    role: string,
    data: {
      enable?: boolean;
      total?: number;
      expiryTime?: number;
      remark?: string;
      flow?: string;
      inboundIds?: string[];
      limitIp?: number;
      subId?: string;
      providerExtras?: Record<string, unknown>;
    },
  ) {
    const existing = await this.findOne(id, adminId, role);
    const existingPanel =
      (existing as any).inbound?.panel ||
      (existing as any).inbounds?.[0]?.panel;
    if (existingPanel && isExternalPanelType(existingPanel.panelType)) {
      return this.updateOnExternalPanel(id, adminId, role, data, existing);
    }

    // Flow is dynamically assigned per inbound later.

    const newTotal =
      data.total !== undefined ? BigInt(data.total) : existing.total;
    const newExpiry =
      data.expiryTime !== undefined
        ? BigInt(data.expiryTime)
        : existing.expiryTime;
    const newFlow = data.flow !== undefined ? data.flow : existing.flow;
    const nextSubId =
      data.subId !== undefined
        ? String(data.subId || "").trim()
        : existing.subId || "";
    if (data.subId !== undefined) {
      if (!nextSubId) {
        throw new BadRequestException('Subscription id (subId) cannot be empty');
      }
      if (!/^[a-zA-Z0-9_-]{4,64}$/.test(nextSubId)) {
        throw new BadRequestException(
          'Subscription id must be 4–64 chars (letters, numbers, _ or -)',
        );
      }
      const clash = await this.prisma.client.findFirst({
        where: { subId: nextSubId, NOT: { id } },
        select: { id: true },
      });
      if (clash) {
        throw new BadRequestException('This subscription id is already in use');
      }
    }
    const now = BigInt(Date.now());
    const usedTraffic = existing.up + existing.down;

    if (role !== 'SUPER_ADMIN' && newTotal === 0n && existing.total !== 0n) {
      const caller = await this.prisma.admin.findUnique({
        where: { id: adminId },
      });
      if (caller && !this.skipTrafficAccounting(caller) && caller.balance > 0) {
        throw new BadRequestException(
          'Cannot set an unlimited client when your account has a traffic limit.',
        );
      }
    }

    if (newTotal === 0n && existing.total !== 0n && existing.adminId) {
      const owner = await this.prisma.admin.findUnique({
        where: { id: existing.adminId },
      });
      this.assertUnlimitedClientAllowed(owner || {}, newTotal);
    }

    if (
      existing.adminId &&
      (data.limitIp !== undefined || data.expiryTime !== undefined)
    ) {
      await this.assertClientLimitsAllowed(existing.adminId, existing.panelId, {
        ...(data.limitIp !== undefined ? { limitIp: data.limitIp } : {}),
        ...(data.expiryTime !== undefined
          ? { expiryTime: data.expiryTime }
          : {}),
      });
    }

    let autoEnable = false;
    if (data.enable === undefined && !existing.enable) {
      const isNotExpired = newExpiry === 0n || newExpiry > now;
      const isNotExhausted = newTotal === 0n || newTotal > usedTraffic;

      if (
        isNotExpired &&
        isNotExhausted &&
        (newTotal > existing.total ||
          (existing.expiryTime !== 0n &&
            (newExpiry === 0n || newExpiry > existing.expiryTime)))
      ) {
        autoEnable = true;
      }
    }

    const newEnable =
      data.enable !== undefined
        ? data.enable
        : autoEnable
          ? true
          : existing.enable;

    const baseClientPayload: any = {
      id: existing.uuid,
      subId: nextSubId,
      email: existing.email.trim(),
      enable: newEnable,
      totalGB: Number(newTotal),
      expiryTime: Number(newExpiry),
      limitIp:
        data.limitIp !== undefined
          ? data.limitIp
          : (existing as any).limitIp || 0,
      tgId: 0,
      flow: newFlow || '',
      comment: data.remark !== undefined ? data.remark : existing.remark || '',
      reset: 0,
    };

    // Map allowed-users to HWID on 3.7+ panels when limitIp is being set
    if (data.limitIp !== undefined) {
      const panel = await this.prisma.panel.findUnique({
        where: { id: existing.panelId },
        select: { apiVersion: true, capabilities: true },
      });
      const limits = resolve3xUiLimit(panel || {}, data.limitIp);
      baseClientPayload.limitIp = limits.limitIp;
      baseClientPayload.limitHwid = limits.limitHwid;
    }

    // ── Compute inbound diff for local DB updates ──────────────────────────
    let addedInboundDbIds: string[] = [];
    let removedInboundDbIds: string[] = [];
    // The complete set of numeric panel inbound IDs after the edit (for sending to panel)
    let newNumericInboundIds: number[] | null = null;

    if (data.inboundIds) {
      if (data.inboundIds.length === 0) {
        throw new BadRequestException('At least one inbound must be selected');
      }
      const existingInboundIds = existing.inbounds.map((i: any) => i.id);
      const newInboundIds = data.inboundIds;

      addedInboundDbIds = newInboundIds.filter(
        (idx) => !existingInboundIds.includes(idx),
      );
      removedInboundDbIds = existingInboundIds.filter(
        (idx: any) => !newInboundIds.includes(idx),
      );

      if (addedInboundDbIds.length > 0) {
        const addedInbounds = await this.prisma.inbound.findMany({
          where: { id: { in: addedInboundDbIds } },
          include: { panel: true },
        });

        const invalidInbounds = addedInbounds.filter(
          (ib) => ib.panelId !== (existing as any).panelId,
        );
        if (invalidInbounds.length > 0) {
          throw new BadRequestException(
            'Cannot add inbounds from a different panel to this client record. Please provision a new client for the other panel.',
          );
        }
      }

      // Resolve numeric panel inbound IDs for the COMPLETE new set
      const resolvedInbounds =
        await this.panelsService.resolveNumericInboundIds(newInboundIds);
      newNumericInboundIds = resolvedInbounds
        .map((ib) => Number(ib.panelInboundId))
        .filter((id) => Number.isFinite(id) && id > 0);

      this.logger.log(
        `[CLIENT_UPDATE] email=${existing.email} ` +
          `currentInboundIds=[${existingInboundIds.join(',')}] ` +
          `requestedInboundIds=[${newInboundIds.join(',')}] ` +
          `toAdd=[${addedInboundDbIds.join(',')}] ` +
          `toRemove=[${removedInboundDbIds.join(',')}] ` +
          `numericPanelInboundIds=[${newNumericInboundIds.join(',')}]`,
      );
    }

    // The panelId for this client (all inbounds must be on the same panel)
    const clientPanelId = (existing as any).panelId;

    const lockKey = `client:update:${id}`;
    const locked = await this.lockService.acquireLock(lockKey, 30000);
    if (!locked) {
      throw new BadRequestException('Client update is already in progress');
    }

    try {
      return await this.executeAtomicOperation(
      existing.adminId || null,
      id,
      'Client',
      'UPDATE',
      { updateData: data },
      async () => {
        const clientPayload: any = { ...baseClientPayload };

        // Determine flow: use the first kept inbound's protocol to decide
        const keptInbounds = existing.inbounds.filter(
          (i: any) => !removedInboundDbIds.includes(i.id),
        );
        const primaryInbound = keptInbounds[0] || existing.inbounds[0];
        if (primaryInbound) {
          const isReality =
            primaryInbound.protocol === 'vless' &&
            (primaryInbound.streamSettings as any)?.security === 'reality';
          clientPayload.flow = isReality ? newFlow || '' : '';
        }

        // Delegate panel synchronization and strict verification to the dedicated method
        return this.syncInboundAssignmentsOnPanel(
          clientPanelId,
          existing.email,
          newNumericInboundIds,
          clientPayload,
          adminId,
        );
      },
      async (tx) => {
        const updateData: Prisma.ClientUpdateInput = {};
        if (existing.email !== existing.email.trim()) {
          updateData.email = existing.email.trim();
        }

        if (data.expiryTime !== undefined) updateData.expiryTime = newExpiry;
        if (data.remark !== undefined) updateData.remark = data.remark;
        if (data.flow !== undefined) updateData.flow = data.flow;
        if (data.limitIp !== undefined) updateData.limitIp = data.limitIp;
        if (data.subId !== undefined) updateData.subId = nextSubId;

        let diff = 0n;
        const previousAllocation = existing.total;
        const newAllocation = newTotal;

        const trafficIncreased =
          data.total !== undefined && newAllocation > existing.total;

        if (data.enable !== undefined) {
          updateData.enable = data.enable;
          updateData.disableReason = data.enable ? null : 'MANUAL';
        } else if (trafficIncreased || autoEnable) {
          updateData.enable = true;
          updateData.disableReason = null;
        }

        if (data.total !== undefined && newAllocation !== existing.total) {
          diff = newAllocation - existing.total;
          updateData.total = newAllocation;
          if (diff > 0n) {
            updateData.balanceDeducted = true;
          }

          if (existing.adminId) {
            const admin = await tx.admin.findUnique({
              where: { id: existing.adminId },
              select: {
                id: true,
                role: true,
                balance: true,
                totalAssigned: true,
                trafficMode: true,
                unlimitedTraffic: true,
                quotaMode: true,
                refundOnEdit: true,
              },
            });
            const skipOwnerAccounting =
              role === 'SUPER_ADMIN' || this.skipTrafficAccounting(admin ?? {});
            if (
              admin &&
              !skipOwnerAccounting &&
              admin.trafficMode === 'ALLOCATION'
            ) {
              if (diff > 0n) {
                await this.adminQuota.assertCanAllocate(
                  admin as any,
                  diff,
                  existing.panelId,
                );
                await this.adminQuota.debit(tx, admin as any, existing.panelId, diff, {
                  clientId: id,
                  targetClientUuid: existing.uuid,
                  action: `CLIENT_TRAFFIC_INCREASE_${Date.now()}`,
                  description: 'Client Traffic Increase',
                });
              } else if (diff < 0n && admin.refundOnEdit) {
                await this.adminQuota.credit(
                  tx,
                  admin as any,
                  existing.panelId,
                  -diff,
                  {
                    clientId: id,
                    targetClientUuid: existing.uuid,
                    action: `CLIENT_TRAFFIC_DECREASE_${Date.now()}`,
                    description: 'Client Traffic Decrease',
                  },
                );
              }
            }
          }
        }

        // Update local ClientInbound records to match the new inbound assignment
        if (data.inboundIds) {
          if (removedInboundDbIds.length > 0) {
            await tx.clientInbound.deleteMany({
              where: {
                clientId: id,
                inboundId: { in: removedInboundDbIds },
              },
            });
          }
          if (addedInboundDbIds.length > 0) {
            await tx.clientInbound.createMany({
              data: addedInboundDbIds.map((inboundId: string) => ({
                clientId: id,
                inboundId,
              })),
            });
          }
        }

        const client = await tx.client.update({
          where: { id },
          data: updateData,
        });
        await tx.auditLog.create({
          data: {
            action: 'CLIENT_UPDATED',
            entity: 'Client',
            entityId: id,
            adminId,
            details: {
              previousAllocation: previousAllocation.toString(),
              newAllocation: newAllocation.toString(),
              trafficDifference: diff.toString(),
              inboundsAdded: addedInboundDbIds,
              inboundsRemoved: removedInboundDbIds,
              newInboundIds: data.inboundIds || 'unchanged',
            },
          },
        });
        return client;
      },
    );
    } finally {
      await this.lockService.releaseLock(lockKey);
    }
  }

  async remove(
    id: string,
    adminId: string,
    role: string,
    skipRefund: boolean = false,
  ) {
    const existing = await this.findOne(id, adminId, role);
    const existingPanel = (existing as any).inbounds?.[0]?.panel
      || (existing as any).inbound?.panel;
    if (existingPanel && isExternalPanelType(existingPanel.panelType)) {
      return this.removeOnExternalPanel(id, adminId, role, skipRefund, existing);
    }
    const lockKey = `client:delete:${existing.id}`;

    // Acquire distributed lock for deletion
    const locked = await this.lockService.acquireLock(lockKey, 30000);
    if (!locked) {
      throw new BadRequestException('Client deletion is already in progress');
    }

    try {
      if ((existing as any).isDeleting) {
        throw new BadRequestException(
          'Client deletion is already flagged in database',
        );
      }

      await this.prisma.client.update({
        where: { id },
        data: { isDeleting: true },
      });

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
              return {
                verified: true,
                message:
                  'Client was FAILED (never provisioned) — skipping panel delete',
              };
            }

            let verifiedCount = 0;
            let errorMessage = '';

            for (const inbound of existing.inbounds) {
              try {
                const delResult = await this.panelsService.deleteClientOnPanel(
                  inbound.panelId,
                  existing.email,
                );
                if (
                  !delResult.success &&
                  delResult.error?.code !== 'CLIENT_NOT_FOUND'
                ) {
                  errorMessage = `Panel deletion failed for ${inbound.panelId}: ${delResult.error?.message}`;
                  return { verified: false, message: errorMessage };
                }
                const isMissing = await this.panelsService.verifyClientMissing(
                  inbound.panelId,
                  existing.email,
                );
                if (!isMissing) {
                  errorMessage = `Verification failed: Client still exists on panel ${inbound.panelId}.`;
                  return { verified: false, message: errorMessage };
                }
                verifiedCount++;
              } catch (err: any) {
                console.error(
                  `Failed to delete client ${existing.email} from panel inbound ${inbound.id}:`,
                  err.message,
                );
                return {
                  verified: false,
                  message: `Panel error: ${err.message}`,
                };
              }
            }

            return { verified: verifiedCount === existing.inbounds.length };
          },
          async (tx) => {
            const refundResult = await this.applyClientDeletionRefund(
              tx,
              {
                id: existing.id,
                uuid: existing.uuid,
                email: existing.email,
                adminId: existing.adminId,
                enable: existing.enable,
                disableReason: (existing as any).disableReason ?? null,
                total: existing.total,
                up: existing.up,
                down: existing.down,
                expiryTime: existing.expiryTime,
                createdWithTrafficMode: existing.createdWithTrafficMode,
                balanceDeducted: (existing as any).balanceDeducted === true,
                panelId: existing.panelId,
                provisioningStatus: (existing as any).provisioningStatus,
              },
              skipRefund,
            );

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
                  trafficRefunded: refundResult.refundedAmount.toString(),
                  verified: true,
                  refundGranted: refundResult.refundGranted,
                  refundSkippedReason: refundResult.refundSkippedReason,
                },
              },
            });
            return { deleted: true };
          },
        );

        deletedSuccessfully = true;
        return result;
      } finally {
        if (!deletedSuccessfully) {
          // Unlock the deletion flag if it failed midway
          await this.prisma.client
            .update({ where: { id }, data: { isDeleting: false } })
            .catch(() => {});
        }
      }
    } finally {
      await this.lockService.releaseLock(lockKey);
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
            await this.panelsService.resetClientTrafficOnPanel(
              inbound.panelId,
              existing.email,
            );
            // Verify reset: client should now report 0 usage via get
            const verifyResult = await this.panelsService.verifyClientExists(
              inbound.panelId,
              existing.email,
            );
            if (!verifyResult.exists) {
              errorMessage = `Verification failed: client not found after reset on panel ${inbound.panelId}.`;
              return { verified: false, message: errorMessage };
            }
            verifiedCount++;
          } catch (err: any) {
            console.error(
              `Failed to reset traffic for client ${existing.email} on panel inbound ${inbound.id}:`,
              err.message,
            );
            return {
              verified: false,
              message: `Failed to reset traffic on panel: ${err.message}`,
            };
          }
        }

        return { verified: verifiedCount === existing.inbounds.length };
      },
      async (tx) => {
        // Success Phase: Database changes and Billing
        if (used > 0n && existing.adminId) {
          const admin = await tx.admin.findUnique({
            where: { id: existing.adminId },
            select: {
              id: true,
              role: true,
              balance: true,
              totalAssigned: true,
              trafficMode: true,
              unlimitedTraffic: true,
              quotaMode: true,
            },
          });
          if (
            admin &&
            role !== 'SUPER_ADMIN' &&
            !this.skipTrafficAccounting(admin)
          ) {
            if (admin.trafficMode === 'ALLOCATION') {
              await this.adminQuota.assertCanAllocate(
                admin as any,
                used,
                existing.panelId,
              );
              await this.adminQuota.debit(
                tx,
                admin as any,
                existing.panelId,
                used,
                {
                  clientId: id,
                  targetClientUuid: existing.uuid,
                  action: `CLIENT_USAGE_RESET_CHARGE_${Date.now()}`,
                  description: `Client Usage Reset Charge (${existing.email})`,
                },
              );
            } else if (admin.trafficMode === 'USAGE') {
              await tx.trafficTransaction.create({
                data: {
                  adminId: admin.id,
                  panelId: existing.panelId,
                  clientId: id,
                  targetClientUuid: existing.uuid,
                  amount: used,
                  type: 'USAGE_CHARGE',
                  action: `HISTORICAL_USAGE_ARCHIVED_${Date.now()}`,
                  description: `Historical Usage Archived via Reset (${existing.email})`,
                  balanceBefore: admin.balance,
                  balanceAfter: admin.balance,
                },
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
            details: { equivalentTrafficRestored: used.toString() },
          },
        });

        return { success: true };
      },
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

  async validateBulkCreate(
    callerId: string,
    role: string,
    dto: BulkCreateClientDto,
  ) {
    const count = dto.endNumber - dto.startNumber + 1;
    if (count <= 0)
      throw new BadRequestException('Invalid start or end number');
    if (count > 1000)
      throw new BadRequestException(
        'Bulk creation limit is 1000 clients per request',
      );

    if (dto.inboundIds?.length) {
      const selected = await this.prisma.inbound.findMany({
        where: { id: { in: dto.inboundIds } },
        select: { panelId: true },
      });
      this.assertSinglePanelInbounds(selected);
    }

    const emails = [];
    const sep = dto.separator === 'None' ? '' : dto.separator || '';
    for (let i = dto.startNumber; i <= dto.endNumber; i++) {
      emails.push(`${dto.prefix}${sep}${i}`);
    }

    const duplicates = await this.prisma.client.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });

    const duplicateEmails = duplicates.map((d) => d.email);
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
      throw new BadRequestException(
        'At least one inbound must be selected for bulk creation',
      );
    }

    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: dto.inboundIds } },
      include: { panel: true },
    });
    if (!inbounds || inbounds.length === 0)
      throw new BadRequestException('No inbounds found');

    const caller = await this.prisma.admin.findUnique({
      where: { id: callerId },
      include: { _count: { select: { clients: true } } },
    });
    if (!caller) throw new BadRequestException('Admin not found');

    let targetAdminId = callerId;
    let targetAdmin = caller;

    if (caller.role === 'SUPER_ADMIN' && dto.adminId) {
      targetAdminId = dto.adminId;
      const explicitTarget = await this.prisma.admin.findUnique({
        where: { id: targetAdminId },
        include: { _count: { select: { clients: true } } },
      });
      if (!explicitTarget)
        throw new BadRequestException('Target Admin not found');
      targetAdmin = explicitTarget;
    }

    const count = dto.endNumber - dto.startNumber + 1;
    if (count <= 0)
      throw new BadRequestException('Invalid start or end number');
    if (count > 1000)
      throw new BadRequestException(
        'Bulk creation limit is 1000 clients per request',
      );

    if (
      targetAdmin.maxClients > 0 &&
      targetAdmin._count.clients + count > targetAdmin.maxClients
    ) {
      throw new BadRequestException(
        `Client limit reached. Maximum allowed: ${targetAdmin.maxClients}. Current: ${targetAdmin._count.clients}`,
      );
    }

    const totalBytesPerClient = BigInt(dto.total || 0);
    const totalBytesRequired = totalBytesPerClient * BigInt(count);

    this.assertUnlimitedClientAllowed(targetAdmin, totalBytesPerClient);

    if (caller.role !== 'SUPER_ADMIN') {
      // Per-panel balance check runs after inbounds resolve to a target panel.
    } else if (totalBytesPerClient === 0n) {
      this.assertUnlimitedClientAllowed(targetAdmin, totalBytesPerClient);
    }

    // Flow is dynamically assigned per inbound later.

    const emails = [];
    const sep = dto.separator === 'None' ? '' : dto.separator || '';
    for (let i = dto.startNumber; i <= dto.endNumber; i++) {
      emails.push(`${dto.prefix}${sep}${i}`);
    }

    const resolvedInbounds = await this.panelsService.resolveNumericInboundIds(
      dto.inboundIds,
    );
    this.assertSinglePanelInbounds(resolvedInbounds);

    const byPanel = new Map<
      string,
      { dbIds: string[]; numericIds: number[] }
    >();
    for (const ib of resolvedInbounds) {
      if (!byPanel.has(ib.panelId))
        byPanel.set(ib.panelId, { dbIds: [], numericIds: [] });
      byPanel.get(ib.panelId)!.dbIds.push(ib.id);
      byPanel.get(ib.panelId)!.numericIds.push(ib.panelInboundId);
    }

    const bulkTargetPanelId = [...byPanel.keys()][0];

    await this.assertClientLimitsAllowed(targetAdminId, bulkTargetPanelId, {
      limitIp: dto.limitIp ?? 0,
      expiryTime: dto.expiryTime ?? 0,
      additionalClients: count,
    });

    if (caller.role !== 'SUPER_ADMIN') {
      const callerSkipsTraffic = this.skipTrafficAccounting(caller);
      if (!callerSkipsTraffic) {
        const callerCtx = await this.adminQuota.loadAdmin(callerId);
        const bucket = await this.adminQuota.getPanelBalance(
          callerCtx,
          bulkTargetPanelId,
        );
        if (bucket.balance > 0 && totalBytesPerClient === 0n) {
          throw new BadRequestException(
            'Cannot create unlimited clients when your account has a traffic limit.',
          );
        }
        await this.adminQuota.assertCanAllocate(
          callerCtx,
          totalBytesRequired,
          bulkTargetPanelId,
          { usageMode: caller.trafficMode === 'USAGE' },
        );
      } else if (totalBytesPerClient > 0n) {
        throw new BadRequestException(
          'Your account has unlimited traffic. You can only create unlimited-traffic clients.',
        );
      }
    }

    for (const [panelId] of byPanel) {
      const existingClient = await this.prisma.client.findFirst({
        where: { panelId, email: { in: emails } },
      });
      if (existingClient) {
        throw new BadRequestException(
          `Email "${existingClient.email}" is already in use on panel ${panelId}.`,
        );
      }
    }

    const panelPayloads = new Map<string, any[]>();
    const clientsDbData: any[] = [];

    for (const email of emails) {
      const clientSubId = require('crypto').randomBytes(8).toString('hex');

      for (const [panelId] of byPanel) {
        const panel = inbounds.find((i) => i.panelId === panelId)?.panel;
        const limits = resolve3xUiLimit(
          {
            apiVersion: panel?.apiVersion,
            capabilities: panel?.capabilities,
          },
          dto.limitIp,
        );
        const clientUuid = crypto.randomUUID();
        const clientSubToken = crypto.randomBytes(5).toString('hex');

        if (!panelPayloads.has(panelId)) panelPayloads.set(panelId, []);

        panelPayloads.get(panelId)!.push({
          id: clientUuid,
          subId: clientSubId,
          email: email,
          enable: dto.enable !== false,
          totalGB: Number(dto.total) || 0,
          expiryTime: dto.expiryTime || 0,
          limitIp: limits.limitIp,
          limitHwid: limits.limitHwid,
          tgId: 0,
          comment: dto.remark || '',
          reset: 0,
        });

        clientsDbData.push({
          panelId,
          adminId: targetAdminId,
          email: email,
          remark: dto.remark || '',
          uuid: clientUuid,
          subId: clientSubId,
          subToken: clientSubToken,
          flow: dto.flow || '',
          total: totalBytesPerClient,
          expiryTime: BigInt(dto.expiryTime || 0),
          limitIp: dto.limitIp || 0,
          enable: dto.enable !== false,
          createdWithTrafficMode: targetAdmin.trafficMode,
        });
      }
    }

    const primaryInbound =
      inbounds.find((i) => dto.inboundIds.includes(i.id)) || inbounds[0];
    const isReality =
      primaryInbound?.protocol === 'vless' &&
      (primaryInbound.streamSettings as any)?.security === 'reality';
    const clientFlow = isReality ? dto.flow || '' : '';

    const createdPanelIds: string[] = [];
    const groupName = dto.group || targetAdmin.username;

    try {
      for (const [panelId, { numericIds }] of byPanel) {
        const panel = await this.prisma.panel.findUnique({
          where: { id: panelId },
        });
        const useBulkApi = supportsBulkClientApi({
          apiVersion: panel?.apiVersion,
          capabilities: panel?.capabilities,
        });

        const clientsForPanel = panelPayloads.get(panelId)!;
        const bulkItems = clientsForPanel.map((p) => ({
          client: {
            id: p.id,
            email: p.email,
            subId: p.subId,
            enable: p.enable,
            totalGB: p.totalGB,
            expiryTime: p.expiryTime,
            limitIp: p.limitIp,
            tgId: p.tgId,
            comment: p.comment,
            reset: p.reset,
            flow: clientFlow,
          },
          inboundIds: numericIds,
        }));

        if (useBulkApi) {
          this.logger.log(
            `[BULK_CREATE] Using bulkCreate API (panel ${panel?.apiVersion ?? 'unknown'}) on ${panel?.name} (${bulkItems.length} clients)`,
          );
          const bulkResult =
            await this.panelsService.bulkCreateClientsOnPanel(
              panelId,
              bulkItems,
              callerId,
            );
          if (!bulkResult.success) {
            throw new BadRequestException(
              bulkResult.error?.message || 'Bulk create failed on panel',
            );
          }

          const skipped: Array<{ email: string; reason: string }> =
            bulkResult.data?.skipped ?? [];
          if (skipped.length > 0) {
            const detail = skipped
              .slice(0, 5)
              .map((s) => `${s.email}: ${s.reason}`)
              .join('; ');
            throw new BadRequestException(
              `Bulk create partially failed on panel: ${detail}`,
            );
          }
        } else {
          this.logger.log(
            `[BULK_CREATE] Panel ${panel?.name} has no bulkCreate — sequential fallback`,
          );
          for (const item of bulkItems) {
            const createResult = await this.createOnXuiPanel(
              panelId,
              item.inboundIds,
              item.client,
              callerId,
            );
            if (!createResult.success) {
              throw new BadRequestException(
                `Failed to create ${item.client.email}: ${createResult.error?.message}`,
              );
            }
          }
        }

        await this.panelsService.assignClientToGroup(
          panelId,
          emails,
          groupName,
        );
        createdPanelIds.push(panelId);
      }
    } catch (e: any) {
      for (const panelId of createdPanelIds) {
        await Promise.all(
          emails.map((email) =>
            this.panelsService
              .deleteClientOnPanel(panelId, email, callerId, true)
              .catch(() => {}),
          ),
        );
      }
      throw new BadRequestException(
        'Failed to bulk create clients on remote panel: ' + e.message,
      );
    }

    try {
      // 3. Save to local DB in transaction
      const createdClients = await this.prisma.$transaction(async (tx) => {
        const callerCtx = await this.adminQuota.loadAdmin(callerId, tx);
        if (
          caller.role !== 'SUPER_ADMIN' &&
          !this.skipTrafficAccounting(caller) &&
          caller.trafficMode === 'ALLOCATION'
        ) {
          await this.adminQuota.assertCanAllocate(
            callerCtx,
            totalBytesRequired,
            bulkTargetPanelId,
          );
        }

        const result = [];
        for (const clientData of clientsDbData) {
          const c = await tx.client.create({
            data: {
              ...clientData,
              balanceDeducted:
                totalBytesPerClient > 0n &&
                caller.role !== 'SUPER_ADMIN' &&
                caller.trafficMode === 'ALLOCATION',
              provisioningStatus: 'ACTIVE',
              provisionedAt: new Date(),
              inbounds: {
                // Only create inbound links for this specific panel's inbounds
                create: dto.inboundIds
                  .filter(
                    (inboundId) =>
                      inbounds.find((i) => i.id === inboundId)?.panelId ===
                      clientData.panelId,
                  )
                  .map((inboundId) => ({ inboundId })),
              },
            },
          });
          result.push(c);
        }

        if (
          totalBytesRequired > 0n &&
          caller.role !== 'SUPER_ADMIN' &&
          !this.skipTrafficAccounting(caller) &&
          caller.trafficMode === 'ALLOCATION'
        ) {
          await this.adminQuota.debit(
            tx,
            callerCtx,
            bulkTargetPanelId,
            totalBytesRequired,
            {
              clientId: result[0]?.id,
              targetClientUuid: result[0]?.uuid,
              action: `BULK_CLIENT_CREATION_${Date.now()}`,
              description: `Bulk Client Creation (${count} clients)`,
            },
          );
        }

        await tx.auditLog.create({
          data: {
            action: 'BULK_CLIENT_CREATED',
            entity: 'Client',
            adminId: callerId,
            details: { count, targetAdminId, prefix: dto.prefix },
          },
        });

        return result;
      });

      return { success: true, count: emails.length };
    } catch (dbError) {
      for (const panelId of createdPanelIds) {
        await Promise.all(
          emails.map((email) =>
            this.panelsService
              .deleteClientOnPanel(panelId, email, callerId, true)
              .catch(() => {}),
          ),
        );
      }
      throw dbError;
    }
  }

  /**
   * Use POST /panel/api/clients/bulkAdjust when the panel supports it.
   * Returns null to fall back to per-client update() when no panel has bulkAdjust.
   */
  private async bulkAdjustOps(
    adminId: string,
    role: string,
    targets: Array<{
      id: string;
      email: string;
      total: bigint;
      expiryTime: bigint;
      adminId: string | null;
    }>,
    dto: BulkClientDto,
  ): Promise<{ success: number; failed: number; errors: string[] } | null> {
    if (dto.action !== 'addTraffic' && dto.action !== 'addDays') return null;

    const clientsWithPanels = await this.prisma.client.findMany({
      where: { id: { in: targets.map((t) => t.id) } },
      include: {
        inbounds: {
          include: { inbound: { include: { panel: true } } },
        },
      },
    });

    const byPanel = new Map<
      string,
      {
        panel: {
          id: string;
          name: string;
          apiVersion?: string | null;
          capabilities: unknown;
        };
        clients: typeof clientsWithPanels;
      }
    >();

    for (const c of clientsWithPanels) {
      const panel = c.inbounds?.[0]?.inbound?.panel;
      if (!panel) continue;
      if (!byPanel.has(panel.id)) {
        byPanel.set(panel.id, { panel, clients: [] });
      }
      byPanel.get(panel.id)!.clients.push(c);
    }

    if (!byPanel.size) return null;

    const panelsWithBulkAdjust = [...byPanel.values()].filter((g) =>
      supportsBulkClientApi({
        apiVersion: g.panel.apiVersion,
        capabilities: g.panel.capabilities,
      }),
    );

    if (!panelsWithBulkAdjust.length) return null;

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const { panel, clients } of panelsWithBulkAdjust) {
      const emails = clients.map((c) => c.email);
      const body: {
        emails: string[];
        addDays?: number;
        addBytes?: number;
      } = { emails };

      if (dto.action === 'addTraffic') {
        body.addBytes = Math.round((dto.value ?? 0) * GB);
        if (body.addBytes <= 0) continue;
      } else {
        body.addDays = dto.value ?? 0;
        if (!body.addDays) continue;
      }

      const res = await this.panelsService.bulkAdjustClientsOnPanel(
        panel.id,
        body,
        adminId,
      );

      if (!res.success) {
        results.failed += clients.length;
        results.errors.push(`${panel.name}: ${res.error?.message}`);
        continue;
      }

      const skippedList: Array<{ email: string; reason: string }> =
        res.data?.skipped ?? [];
      const skippedEmails = new Set(skippedList.map((s) => s.email));

      for (const c of clients) {
        if (skippedEmails.has(c.email)) {
          results.failed++;
          const reason =
            skippedList.find((s) => s.email === c.email)?.reason || 'skipped';
          results.errors.push(`${c.email}: ${reason}`);
          continue;
        }

        try {
          await this.applyBulkAdjustLocalDb(adminId, role, c, dto);
          results.success++;
        } catch (err: any) {
          const compensateBody: {
            emails: string[];
            addDays?: number;
            addBytes?: number;
          } = { emails: [c.email] };
          if (dto.action === 'addTraffic') {
            compensateBody.addBytes = -Math.round((dto.value ?? 0) * GB);
          } else {
            compensateBody.addDays = -(dto.value ?? 0);
          }
          const compensate = await this.panelsService.bulkAdjustClientsOnPanel(
            panel.id,
            compensateBody,
            adminId,
          );
          if (!compensate.success) {
            this.logger.error(
              `[BULK_ADJUST] Panel compensation failed for ${c.email}: ${compensate.error?.message}`,
            );
          }
          results.failed++;
          results.errors.push(`${c.email}: ${err.message}`);
        }
      }
    }

    // Panels without bulkAdjust API — sequential fallback per client
    for (const { panel, clients } of byPanel.values()) {
      if (
        supportsBulkClientApi({
          apiVersion: panel.apiVersion,
          capabilities: panel.capabilities,
        })
      ) {
        continue;
      }

      for (const c of clients) {
        try {
          if (dto.action === 'addTraffic') {
            const bytes = BigInt(Math.round((dto.value ?? 0) * GB));
            if (bytes > 0n) {
              await this.update(c.id, adminId, role, {
                total: Number(c.total + bytes),
                enable: true,
              });
            }
          } else {
            const ms = BigInt((dto.value ?? 0) * 24 * 60 * 60 * 1000);
            const now = BigInt(Date.now());
            const base = c.expiryTime > 0n ? c.expiryTime : now;
            await this.update(c.id, adminId, role, {
              expiryTime: Number(base + ms),
            });
          }
          results.success++;
        } catch (err: any) {
          results.failed++;
          results.errors.push(`${c.email}: ${err.message}`);
        }
      }
    }

    return results;
  }

  /** Sync local DB after panel bulkAdjust — does not call the panel again. */
  private async applyBulkAdjustLocalDb(
    adminId: string,
    role: string,
    client: {
      id: string;
      uuid: string;
      email: string;
      total: bigint;
      expiryTime: bigint;
      adminId: string | null;
      panelId: string;
      up: bigint;
      down: bigint;
    },
    dto: BulkClientDto,
  ) {
    if (dto.action === 'addTraffic') {
      const bytes = BigInt(Math.round((dto.value ?? 0) * GB));
      if (bytes <= 0n) return;

      await this.prisma.$transaction(async (tx) => {
        if (client.adminId) {
          const admin = await tx.admin.findUnique({
            where: { id: client.adminId },
            select: {
              id: true,
              role: true,
              balance: true,
              totalAssigned: true,
              trafficMode: true,
              unlimitedTraffic: true,
              quotaMode: true,
            },
          });
          if (
            admin &&
            role !== 'SUPER_ADMIN' &&
            !this.skipTrafficAccounting(admin) &&
            admin.trafficMode === 'ALLOCATION'
          ) {
            await this.adminQuota.assertCanAllocate(
              admin as any,
              bytes,
              client.panelId,
            );
            await this.adminQuota.debit(tx, admin as any, client.panelId, bytes, {
              clientId: client.id,
              targetClientUuid: client.uuid,
              action: `CLIENT_TRAFFIC_INCREASE_${Date.now()}`,
              description: 'Bulk Client Traffic Increase',
            });
          }
        }

        const newTotal = client.total + bytes;
        const used = client.up + client.down;
        const shouldEnable = newTotal === 0n || newTotal > used;

        await tx.client.update({
          where: { id: client.id },
          data: {
            total: newTotal,
            balanceDeducted: true,
            ...(shouldEnable
              ? { enable: true, disableReason: null }
              : {}),
          },
        });
      });
    } else if (dto.action === 'addDays') {
      const ms = BigInt((dto.value ?? 0) * 24 * 60 * 60 * 1000);
      if (ms <= 0n) return;
      const now = BigInt(Date.now());
      const base = client.expiryTime > 0n ? client.expiryTime : now;

      await this.prisma.client.update({
        where: { id: client.id },
        data: {
          expiryTime: base + ms,
          enable: true,
          disableReason: null,
        },
      });
    }
  }

  /**
   * Delete/cleanup many clients using one POST /panel/api/clients/bulkDel per
   * panel instead of one request per client. Panels that predate the bulk API
   * fall back to the sequential remove() path.
   */
  private async bulkDeleteOps(
    adminId: string,
    role: string,
    targets: Array<{ id: string }>,
    skipRefund: boolean,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] };

    const clients = await this.prisma.client.findMany({
      where: { id: { in: targets.map((t) => t.id) }, isDeleting: false },
      include: { panel: true },
    });

    const inFlight = targets.length - clients.length;
    if (inFlight > 0) {
      results.failed += inFlight;
      results.errors.push(
        `${inFlight} client(s) skipped — deletion already in progress`,
      );
    }

    const byPanel = new Map<string, typeof clients>();
    for (const c of clients) {
      if (!byPanel.has(c.panelId)) byPanel.set(c.panelId, []);
      byPanel.get(c.panelId)!.push(c);
    }

    for (const [panelId, group] of byPanel) {
      const panel = group[0].panel;
      const panelName = panel?.name || panelId;

      if (
        !panel ||
        !supportsBulkDelete({
          apiVersion: panel.apiVersion,
          capabilities: panel.capabilities,
        })
      ) {
        this.logger.log(
          `[BULK_DELETE] panel=${panelName} does not support bulkDel — ` +
            `falling back to ${group.length} sequential deletes`,
        );
        for (const c of group) {
          try {
            await this.remove(c.id, adminId, role, skipRefund);
            results.success++;
          } catch (err: any) {
            results.failed++;
            results.errors.push(`${c.email}: ${err.message}`);
          }
        }
        continue;
      }

      // FAILED clients were never provisioned — never send them to the panel
      const onPanel = group.filter((c) => c.provisioningStatus !== 'FAILED');
      const deletable = group.filter((c) => c.provisioningStatus === 'FAILED');

      if (onPanel.length) {
        const emails = onPanel.map((c) => c.email);
        // Claim the rows so a concurrent request cannot delete them twice
        await this.prisma.client.updateMany({
          where: { id: { in: onPanel.map((c) => c.id) } },
          data: { isDeleting: true },
        });

        const res = await this.panelsService.bulkDeleteClientsOnPanel(
          panelId,
          emails,
          { keepTraffic: false },
          adminId,
        );

        if (!res.success) {
          this.logger.error(
            `[BULK_DELETE] panel=${panelName} emails=${emails.length} failed: ${res.error?.message}`,
          );
          await this.prisma.client.updateMany({
            where: { id: { in: onPanel.map((c) => c.id) } },
            data: { isDeleting: false },
          });
          results.failed += onPanel.length;
          results.errors.push(`${panelName}: ${res.error?.message}`);
        } else {
          const skipped: Array<{ email: string; reason: string }> =
            res.data?.skipped ?? [];
          // "not found" means the client is already gone from the panel — the
          // local row still has to be removed, same as deleteClientOnPanel().
          const blocked = new Map(
            skipped
              .filter((s) => !/not found/i.test(s.reason || ''))
              .map((s) => [s.email, s.reason]),
          );

          this.logger.log(
            `[BULK_DELETE] panel=${panelName} emails=${emails.length} ` +
              `deleted=${res.data?.deleted ?? 0} skipped=${skipped.length} ` +
              `blocked=${blocked.size} skipRefund=${skipRefund}`,
          );

          const blockedIds: string[] = [];
          for (const c of onPanel) {
            if (blocked.has(c.email)) {
              blockedIds.push(c.id);
              results.failed++;
              results.errors.push(`${c.email}: ${blocked.get(c.email)}`);
              continue;
            }
            deletable.push(c);
          }
          if (blockedIds.length) {
            await this.prisma.client.updateMany({
              where: { id: { in: blockedIds } },
              data: { isDeleting: false },
            });
          }
        }
      } else {
        this.logger.log(
          `[BULK_DELETE] panel=${panelName} all ${group.length} targets were ` +
            `never provisioned — local delete only`,
        );
      }

      for (const c of deletable) {
        try {
          await this.applyClientDeletionLocal(adminId, c.id, skipRefund);
          results.success++;
        } catch (err: any) {
          // Panel side is already done; the row stays flagged isDeleting so a
          // retry does not re-issue a panel delete for a client that is gone.
          results.failed++;
          results.errors.push(`${c.email}: ${err.message}`);
        }
      }
    }

    return results;
  }

  /**
   * Remove a client row (+ refund) after the panel-side delete already
   * succeeded. Never touches the panel again.
   */
  private async applyClientDeletionLocal(
    adminId: string,
    clientId: string,
    skipRefund: boolean,
  ) {
    const existing = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { admin: { select: { username: true } } },
    });
    if (!existing) return;

    await this.prisma.$transaction(async (tx) => {
      const refundResult = await this.applyClientDeletionRefund(
        tx,
        {
          id: existing.id,
          uuid: existing.uuid,
          email: existing.email,
          adminId: existing.adminId,
          enable: existing.enable,
          disableReason: existing.disableReason,
          total: existing.total,
          up: existing.up,
          down: existing.down,
          expiryTime: existing.expiryTime,
          createdWithTrafficMode: existing.createdWithTrafficMode,
          balanceDeducted: existing.balanceDeducted === true,
          panelId: existing.panelId,
          provisioningStatus: existing.provisioningStatus,
        },
        skipRefund,
      );

      await tx.client.delete({ where: { id: existing.id } });
      await tx.auditLog.create({
        data: {
          action: skipRefund ? 'CLIENT_CLEANUP' : 'CLIENT_DELETED',
          entity: 'Client',
          entityId: existing.id,
          adminId,
          details: {
            clientEmail: existing.email,
            adminUsername: existing.admin?.username,
            trafficBefore: existing.total.toString(),
            trafficRefunded: refundResult.refundedAmount.toString(),
            verified: true,
            bulkDeleted: true,
            refundGranted: refundResult.refundGranted,
            refundSkippedReason: refundResult.refundSkippedReason,
          },
        },
      });
    });
  }

  /** Bulk operations, scoped to the caller's ownership when a reseller. */
  async bulk(adminId: string, role: string, dto: BulkClientDto) {
    if (!dto.ids?.length) throw new BadRequestException('No clients selected');

    const scope: Prisma.ClientWhereInput = { id: { in: dto.ids } };
    if (role !== 'SUPER_ADMIN') scope.adminId = adminId;

    const targets = await this.prisma.client.findMany({ where: scope });
    if (!targets.length) return { affected: 0 };

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Up-front balance checks for traffic addition (per owning admin)
    if (dto.action === 'addTraffic') {
      const bytesToAddPerClient = BigInt(Math.round((dto.value ?? 0) * GB));
      const requiredByOwnerPanel = new Map<string, bigint>();

      for (const t of targets) {
        if (!t.adminId) continue;
        const owner = await this.prisma.admin.findUnique({
          where: { id: t.adminId },
          select: {
            id: true,
            role: true,
            unlimitedTraffic: true,
            trafficMode: true,
            quotaMode: true,
            balance: true,
          },
        });
        if (
          !owner ||
          this.skipTrafficAccounting(owner) ||
          owner.trafficMode !== 'ALLOCATION'
        ) {
          continue;
        }
        const key = `${t.adminId}:${t.panelId}`;
        requiredByOwnerPanel.set(
          key,
          (requiredByOwnerPanel.get(key) ?? 0n) + bytesToAddPerClient,
        );
      }

      for (const [key, totalRequired] of requiredByOwnerPanel) {
        const [ownerId, panelId] = key.split(':');
        const owner = await this.adminQuota.loadAdmin(ownerId);
        const bucket = await this.adminQuota.getPanelBalance(owner, panelId);
        if (bucket.balance < Number(totalRequired)) {
          throw new BadRequestException(
            `Insufficient balance to add traffic. Required: ${Number(totalRequired) / GB} GB, Available: ${bucket.balance / GB} GB`,
          );
        }
      }
    }

    if (dto.action === 'addTraffic' || dto.action === 'addDays') {
      const optimized = await this.bulkAdjustOps(
        adminId,
        role,
        targets,
        dto,
      );
      if (optimized) {
        await this.prisma.auditLog.create({
          data: {
            action: `BULK_${dto.action.toUpperCase()}`,
            entity: 'Client',
            adminId,
            details: {
              count: targets.length,
              success: optimized.success,
              failed: optimized.failed,
              errors: optimized.errors,
              value: dto.value,
              optimized: true,
            },
          },
        });
        if (optimized.failed > 0) {
          return {
            affected: optimized.success,
            failed: optimized.failed,
            errors: optimized.errors,
          };
        }
        return { affected: optimized.success };
      }
    }

    if (dto.action === 'assignGroup') {
      if (!dto.groupName)
        throw new BadRequestException('Group name is required');

      const panelClients = new Map<string, string[]>();
      for (const t of targets) {
        const clientWithInbounds = await this.prisma.client.findUnique({
          where: { id: t.id },
          include: {
            inbounds: {
              include: {
                inbound: true,
              },
            },
          },
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
          await this.panelsService.assignClientToGroup(
            panelId,
            emails,
            dto.groupName,
          );
          results.success += emails.length;
        } catch (err: any) {
          results.failed += emails.length;
          results.errors.push(`Panel ${panelId}: ${err.message}`);
        }
      }
    } else if (dto.action === 'delete' || dto.action === 'cleanup') {
      if (dto.action === 'cleanup') {
        void this.jobs?.enqueue('cleanup', 'run', {
          data: { count: targets.length, adminId },
        });
      }
      const deleteResults = await this.bulkDeleteOps(
        adminId,
        role,
        targets,
        dto.action === 'cleanup',
      );
      results.success = deleteResults.success;
      results.failed = deleteResults.failed;
      results.errors = deleteResults.errors;
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
                case 'assignInbounds': {
                  if (!dto.inboundIds || dto.inboundIds.length === 0)
                    throw new BadRequestException('No inbounds selected');
                  const currentInbounds =
                    await this.prisma.clientInbound.findMany({
                      where: { clientId: t.id },
                    });
                  const existingIds = currentInbounds.map((i) => i.inboundId);
                  const combined = Array.from(
                    new Set([...existingIds, ...dto.inboundIds]),
                  );
                  await this.update(t.id, adminId, role, {
                    inboundIds: combined,
                  });
                  break;
                }
                case 'addTraffic': {
                  const bytes = BigInt(Math.round((dto.value ?? 0) * GB));
                  if (bytes > 0n) {
                    await this.update(t.id, adminId, role, {
                      total: Number(t.total + bytes),
                    });
                  }
                  break;
                }
                case 'addDays': {
                  const ms = BigInt((dto.value ?? 0) * 24 * 60 * 60 * 1000);
                  const now = BigInt(Date.now());
                  const base = t.expiryTime > 0n ? t.expiryTime : now;
                  await this.update(t.id, adminId, role, {
                    expiryTime: Number(base + ms),
                  });
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
          }),
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
        },
      },
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
    const thresholdSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'cleanup_threshold_days' },
    });
    const thresholdDays = thresholdSetting
      ? Number(thresholdSetting.value.replace(/"/g, '')) || 30
      : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = BigInt(Date.now());

    const where: Prisma.ClientWhereInput = {
      expiryTime: { gt: 0n, lt: now - BigInt(thresholdMs) },
    };
    if (role !== 'SUPER_ADMIN') {
      where.adminId = adminId;
    }

    const candidates = await this.prisma.client.findMany({
      where,
      select: {
        id: true,
        email: true,
        remark: true,
        ownerTag: true,
        uuid: true,
        subId: true,
        enable: true,
        flow: true,
        up: true,
        down: true,
        total: true,
        expiryTime: true,
        createdAt: true,
        admin: { select: { id: true, username: true } },
        inbounds: {
          select: {
            inbound: {
              select: {
                id: true,
                tag: true,
                panel: {
                  select: { id: true, name: true, url: true, subUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { expiryTime: 'asc' },
    });

    return candidates.map((client) => ({
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map((ci) => ci.inbound) || [],
    }));
  }
}

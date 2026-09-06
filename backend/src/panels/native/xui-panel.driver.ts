import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PanelsService } from '../panels.service';
import { XUI_NATIVE_CAPABILITIES } from './native-panel-capabilities';
import { flatCapabilitiesFor } from './panel-capability.catalog';
import type {
  DriverCreateClientInput,
  DriverUpdateClientInput,
  PanelCredentialsInput,
  PanelDriver,
  RemoteClientSnapshot,
  TestConnectionResult,
} from './panel-driver.types';

@Injectable()
export class XuiPanelDriver implements PanelDriver {
  readonly panelType = '3x-ui' as const;

  constructor(
    private moduleRef: ModuleRef,
    private prisma: PrismaService,
  ) {}

  capabilities() {
    return XUI_NATIVE_CAPABILITIES;
  }

  flatCapabilities() {
    return flatCapabilitiesFor('3x-ui');
  }

  async testConnection(creds: PanelCredentialsInput): Promise<TestConnectionResult> {
    const panels = this.panelsService();
    const start = Date.now();
    try {
      const result: any = await panels.testConnection({
        url: creds.apiBaseUrl,
        apiToken: creds.apiToken || creds.apiKey,
      });
      return {
        ok: result?.ok === true,
        latencyMs: result?.pingMs ?? Date.now() - start,
        version: result?.version ?? result?.apiVersion ?? null,
        remoteIdentity: await this.resolveRemoteIdentity(creds),
        capabilities: XUI_NATIVE_CAPABILITIES,
        error: result?.ok ? undefined : result?.message || result?.error,
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        capabilities: XUI_NATIVE_CAPABILITIES,
        error: err?.message || String(err),
      };
    }
  }

  async resolveRemoteIdentity(creds: PanelCredentialsInput): Promise<string> {
    try {
      return `3x-ui:${new URL(creds.apiBaseUrl).host}`;
    } catch {
      return `3x-ui:${creds.apiBaseUrl}`;
    }
  }

  parseSubLink(): null {
    return null;
  }

  async listClients(panelId: string): Promise<RemoteClientSnapshot[]> {
    const rows = await this.prisma.client.findMany({ where: { panelId } });
    return rows.map((row) => this.toSnapshot(row));
  }

  async getClient(panelId: string, username: string): Promise<RemoteClientSnapshot | null> {
    const row = await this.prisma.client.findFirst({
      where: { panelId, email: username },
    });
    return row ? this.toSnapshot(row) : null;
  }

  async createClient(
    panelId: string,
    input: DriverCreateClientInput,
  ): Promise<RemoteClientSnapshot> {
    const extras = input.providerExtras || {};
    const numericIds = (extras.numericInboundIds as number[]) || [];
    const extraPayload =
      extras.payload && typeof extras.payload === 'object'
        ? (extras.payload as Record<string, any>)
        : {};
    const payload = {
      email: String(extraPayload.email || input.username),
      totalGB: extraPayload.totalGB ?? (input.totalBytes ? Number(input.totalBytes) / 1024 ** 3 : 0),
      expiryTime: extraPayload.expiryTime ?? input.expiryTimeMs ?? 0,
      limitIp: extraPayload.limitIp ?? input.limitIp,
      enable: extraPayload.enable ?? input.enable !== false,
      limitHwid: extraPayload.limitHwid,
      tgId: extraPayload.tgId,
      flow: extraPayload.flow,
      subId: extraPayload.subId,
      comment: extraPayload.comment,
      reset: extraPayload.reset,
      resetMax: extraPayload.resetMax,
      trafficReset: extraPayload.trafficReset,
      trafficResetDay: extraPayload.trafficResetDay,
    };
    const result = await this.panelsService().createClientOnPanel(
      panelId,
      numericIds,
      payload,
    );
    if (!result.success) {
      throw new Error(result.error?.message || '3x-ui createClient failed');
    }
    return {
      username: input.username,
      uuid: String(extras.uuid || ''),
      enable: payload.enable !== false,
      up: 0n,
      down: 0n,
      total: input.totalBytes ?? 0n,
      expiryTime: BigInt(input.expiryTimeMs || 0),
      limitIp: input.limitIp,
      providerMeta: { via: 'XuiPanelDriver' },
    };
  }

  async updateClient(
    panelId: string,
    username: string,
    input: DriverUpdateClientInput,
  ): Promise<RemoteClientSnapshot> {
    const extras = input.providerExtras || {};
    const payload = (extras.payload as Record<string, any>) || {
      email: username,
      totalGB: input.totalBytes ? Number(input.totalBytes) / 1024 ** 3 : undefined,
      expiryTime: input.expiryTimeMs,
      enable: input.enable,
      limitIp: input.limitIp,
    };
    const result = await this.panelsService().updateClientOnPanel(
      panelId,
      username,
      payload,
    );
    if (!result.success) {
      throw new Error(result.error?.message || '3x-ui updateClient failed');
    }
    const existing = await this.getClient(panelId, username);
    return (
      existing || {
        username,
        uuid: '',
        enable: input.enable !== false,
        up: 0n,
        down: 0n,
        total: input.totalBytes ?? 0n,
        expiryTime: BigInt(input.expiryTimeMs || 0),
      }
    );
  }

  async deleteClient(panelId: string, username: string): Promise<void> {
    const result = await this.panelsService().deleteClientOnPanel(panelId, username);
    if (!result.success) {
      throw new Error(result.error?.message || '3x-ui deleteClient failed');
    }
  }

  private panelsService(): PanelsService {
    // Lazy resolve avoids PanelsService ↔ driver constructor cycle.
    return this.moduleRef.get(PanelsService, { strict: false });
  }

  private toSnapshot(row: {
    email: string;
    uuid: string;
    enable: boolean;
    up: bigint;
    down: bigint;
    total: bigint;
    expiryTime: bigint;
    limitIp: number;
    remark?: string | null;
    providerMeta?: unknown;
  }): RemoteClientSnapshot {
    return {
      username: row.email,
      uuid: row.uuid,
      enable: row.enable,
      up: row.up,
      down: row.down,
      total: row.total,
      expiryTime: row.expiryTime,
      limitIp: row.limitIp,
      note: row.remark,
      providerMeta:
        row.providerMeta && typeof row.providerMeta === 'object'
          ? (row.providerMeta as Record<string, unknown>)
          : {},
    };
  }
}

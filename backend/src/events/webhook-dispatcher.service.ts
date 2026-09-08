import { createHmac } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../platform/architecture/feature-flags.service';
import { PLATFORM_FLAGS } from '../platform/architecture/feature-flags';
import { DomainEventBusService } from './domain-event-bus.service';
import type { DomainEvent } from './domain-event.bus';
import { WEBHOOK_EVENT_ALLOWLIST } from './event-aliases';

export const WEBHOOK_SIGNATURE_HEADER = 'x-hmpanel-signature';

export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

@Injectable()
export class WebhookDispatcher implements OnModuleInit {
  private readonly logger = new Logger(WebhookDispatcher.name);
  private unsubscribe?: () => void;
  /** Tests inject a fake POST; production uses fetch. */
  postImpl:
    | ((url: string, body: string, headers: Record<string, string>) => Promise<void>)
    | null = null;

  constructor(
    private prisma: PrismaService,
    private flags: FeatureFlagsService,
    private bus: DomainEventBusService,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.bus.on('*', (event) => {
      void this.dispatch(event);
    });
  }

  async dispatch(event: DomainEvent): Promise<number> {
    if (!(await this.flags.isEnabled(PLATFORM_FLAGS.OUTBOUND_WEBHOOKS_V1))) {
      return 0;
    }
    if (!WEBHOOK_EVENT_ALLOWLIST.has(event.type)) return 0;

    let rows: Array<{ webhookUrl: string | null; keyHash: string; scopes: unknown }> = [];
    try {
      rows = await this.model().findMany({
        where: { enabled: true, webhookUrl: { not: null } },
        select: { webhookUrl: true, keyHash: true, scopes: true },
      });
    } catch {
      return 0;
    }

    const body = JSON.stringify({
      type: event.type,
      occurredAt: event.occurredAt,
      payload: event.payload,
    });
    let sent = 0;
    for (const row of rows) {
      const url = String(row.webhookUrl || '').trim();
      if (!this.allowedUrl(url)) continue;
      const scopes = Array.isArray(row.scopes) ? row.scopes.map(String) : [];
      if (scopes.length && !scopes.includes('webhooks.manage')) continue;
      const headers = {
        'content-type': 'application/json',
        [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(row.keyHash, body),
      };
      try {
        await this.postJson(url, body, headers);
        sent += 1;
      } catch (err: any) {
        try {
          await this.postJson(url, body, headers);
          sent += 1;
        } catch (retryErr: any) {
          this.logger.warn(
            `webhook ${event.type} failed: ${retryErr?.message || err?.message || retryErr}`,
          );
        }
      }
    }
    return sent;
  }

  private allowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  private async postJson(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<void> {
    if (this.postImpl) {
      await this.postImpl(url, body, headers);
      return;
    }
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  private model(): any {
    return (this.prisma as any).botApiClient;
  }
}

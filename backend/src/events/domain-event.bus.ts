import { aliasesFor } from './event-aliases';

export type DomainEventType =
  | 'client.created'
  | 'client.updated'
  | 'client.deleted'
  | 'traffic.debited'
  | 'order.created'
  | 'order.paid'
  | 'order.completed'
  | 'payment.verified'
  | 'payment.completed'
  | 'payment.failed'
  | 'panel.synced'
  | 'theme.published'
  | 'admin.created'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.expiring'
  | 'user.expired'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.expiring'
  | 'subscription.expired';

export interface DomainEvent<T = Record<string, unknown>> {
  type: DomainEventType | string;
  occurredAt: string;
  payload: T;
}

type Handler = (event: DomainEvent) => void | Promise<void>;

export class DomainEventBus {
  private readonly handlers = new Map<string, Handler[]>();
  private readonly history: DomainEvent[] = [];
  private readonly maxHistory = 200;

  on(type: string, handler: Handler): () => void {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      this.handlers.set(
        type,
        (this.handlers.get(type) || []).filter((h) => h !== handler),
      );
    };
  }

  async emit(type: string, payload: Record<string, unknown> = {}): Promise<void> {
    const occurredAt = new Date().toISOString();
    const event: DomainEvent = { type, occurredAt, payload };
    this.history.push(event);
    if (this.history.length > this.maxHistory) this.history.shift();

    await this.notify(type, event, true);
    for (const alias of aliasesFor(type)) {
      await this.notify(alias, { ...event, type: alias }, false);
    }
  }

  recent(limit = 50): DomainEvent[] {
    return this.history.slice(-limit);
  }

  private async notify(type: string, event: DomainEvent, includeStar: boolean) {
    const list = [
      ...(this.handlers.get(type) || []),
      ...(includeStar ? this.handlers.get('*') || [] : []),
    ];
    for (const handler of list) {
      await handler(event);
    }
  }
}

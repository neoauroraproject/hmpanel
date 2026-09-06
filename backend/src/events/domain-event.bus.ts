export type DomainEventType =
  | 'client.created'
  | 'client.updated'
  | 'client.deleted'
  | 'traffic.debited'
  | 'order.created'
  | 'order.paid'
  | 'payment.verified'
  | 'panel.synced'
  | 'theme.published'
  | 'admin.created';

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
    const event: DomainEvent = {
      type,
      occurredAt: new Date().toISOString(),
      payload,
    };
    this.history.push(event);
    if (this.history.length > this.maxHistory) this.history.shift();
    const list = [
      ...(this.handlers.get(type) || []),
      ...(this.handlers.get('*') || []),
    ];
    for (const handler of list) {
      await handler(event);
    }
  }

  recent(limit = 50): DomainEvent[] {
    return this.history.slice(-limit);
  }
}

import { DomainEventBus } from './domain-event.bus';

describe('DomainEventBus', () => {
  it('delivers events to subscribers and keeps recent history', async () => {
    const bus = new DomainEventBus();
    const seen: string[] = [];
    bus.on('client.created', (e) => {
      seen.push(e.type);
    });
    await bus.emit('client.created', { email: 'a@b.c' });
    expect(seen).toEqual(['client.created']);
    expect(bus.recent()[0].payload).toEqual({ email: 'a@b.c' });
  });

  it('fans out contract aliases without replacing the original type', async () => {
    const bus = new DomainEventBus();
    const seen: string[] = [];
    bus.on('payment.verified', (e) => seen.push(e.type));
    bus.on('payment.completed', (e) => seen.push(e.type));
    await bus.emit('payment.verified', { orderId: 'o1' });
    expect(seen).toEqual(['payment.verified', 'payment.completed']);
    expect(bus.recent().map((e) => e.type)).toEqual(['payment.verified']);
  });
});

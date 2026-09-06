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
});

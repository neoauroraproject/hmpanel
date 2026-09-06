import { CRITICAL_FLOWS, getCriticalFlow } from './critical-flows.inventory';

describe('critical flow inventory', () => {
  it('covers createClient, traffic debit, sync, and backup restore', () => {
    const ids = CRITICAL_FLOWS.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'clients.create',
        'traffic.debit',
        'panels.sync',
        'backups.restore',
      ]),
    );
  });

  it('looks up a known flow', () => {
    expect(getCriticalFlow('clients.create').service).toBe('ClientsService');
  });
});

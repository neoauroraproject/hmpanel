import { PolicyEngine } from './policy.engine';

describe('PolicyEngine reserve/commit', () => {
  it('rejects create when maxClients is reached', async () => {
    const engine = new PolicyEngine();
    await expect(
      engine.reserve({
        adminId: 'a1',
        operation: 'CREATE_USER',
        maxClients: 2,
        currentClients: 2,
      }),
    ).rejects.toThrow(/Client limit reached/);
  });

  it('commits on success and rolls back after execute failure', async () => {
    const engine = new PolicyEngine();
    const ok = await engine.runReserved(
      { adminId: 'a1', operation: 'CREATE_USER', maxClients: 5, currentClients: 1 },
      async () => 'created',
    );
    expect(ok).toBe('created');

    await expect(
      engine.runReserved(
        { adminId: 'a1', operation: 'CREATE_USER', maxClients: 5, currentClients: 1 },
        async () => {
          throw new Error('provider failed');
        },
      ),
    ).rejects.toThrow('provider failed');
  });

  it('rejects debit when balance is insufficient', async () => {
    const engine = new PolicyEngine();
    await expect(
      engine.reserve({
        adminId: 'a1',
        operation: 'DEBIT_TRAFFIC',
        trafficBytes: 100,
        balance: 10,
      }),
    ).rejects.toThrow(/Insufficient traffic balance/);
  });
});

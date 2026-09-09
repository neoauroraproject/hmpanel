import {
  BASELINE_MIGRATION_STEPS,
  SchemaMigrationAdapter,
} from './schema-migration.adapter';

describe('SchemaMigrationAdapter', () => {
  it('no-ops when versions match', () => {
    const adapter = new SchemaMigrationAdapter(BASELINE_MIGRATION_STEPS);
    expect(adapter.plan(1, 1)).toEqual([]);
  });

  it('runs v0 → v1 baseline idempotently', async () => {
    const adapter = new SchemaMigrationAdapter(BASELINE_MIGRATION_STEPS);
    const first = await adapter.migrate(0, 1);
    const second = await adapter.migrate(0, 1);
    expect(first.steps).toEqual(['migrate-from-v0-platform-baseline']);
    expect(second.steps).toEqual(first.steps);
  });

  it('plans v1 → v2 payment ledger step', async () => {
    const adapter = new SchemaMigrationAdapter(BASELINE_MIGRATION_STEPS);
    const plan = adapter.plan(1, 2);
    expect(plan.map((s) => s.id)).toEqual(['migrate-from-v1-payment-ledger']);
    const result = await adapter.migrate(0, 2);
    expect(result.steps).toEqual([
      'migrate-from-v0-platform-baseline',
      'migrate-from-v1-payment-ledger',
    ]);
  });

  it('refuses silent downgrade', () => {
    const adapter = new SchemaMigrationAdapter(BASELINE_MIGRATION_STEPS);
    expect(() => adapter.plan(1, 0)).toThrow(/Downgrade/);
  });
});

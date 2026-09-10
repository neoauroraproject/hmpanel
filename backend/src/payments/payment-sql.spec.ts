import { PAYMENT_LEDGER_MIGRATION_SQL } from './payment-sql';

describe('payment ledger SQL migration', () => {
  it('creates PaymentLedger and Stars enum value idempotently', () => {
    const blob = PAYMENT_LEDGER_MIGRATION_SQL.join('\n');
    expect(blob).toContain('CREATE TABLE IF NOT EXISTS "PaymentLedger"');
    expect(blob).toContain('"idempotencyKey"');
    expect(blob).toContain('"providerChargeId"');
    expect(blob).toContain("ADD VALUE IF NOT EXISTS 'TELEGRAM_STARS'");
    expect(blob).toContain("ADD VALUE IF NOT EXISTS 'TELEGRAM_WALLET'");
  });
});

/** Idempotent DDL applied by ensureCriticalSchema / ensurePremiumSchema. */

export const STORE_PAYMENT_METHOD_TELEGRAM_STARS_SQL = `
DO $$ BEGIN
  ALTER TYPE "StorePaymentMethod" ADD VALUE IF NOT EXISTS 'TELEGRAM_STARS';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$
`.trim();

export const PAYMENT_LEDGER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "PaymentLedger" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "gateway" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "orderId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "providerChargeId" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentLedger_pkey" PRIMARY KEY ("id")
)
`.trim();

export const PAYMENT_LEDGER_INDEXES_SQL = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "PaymentLedger_idempotencyKey_key" ON "PaymentLedger"("idempotencyKey")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PaymentLedger_providerChargeId_key" ON "PaymentLedger"("providerChargeId")`,
  `CREATE INDEX IF NOT EXISTS "PaymentLedger_adminId_createdAt_idx" ON "PaymentLedger"("adminId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "PaymentLedger_orderId_idx" ON "PaymentLedger"("orderId")`,
  `CREATE INDEX IF NOT EXISTS "PaymentLedger_status_idx" ON "PaymentLedger"("status")`,
];

export const PAYMENT_LEDGER_MIGRATION_SQL = [
  STORE_PAYMENT_METHOD_TELEGRAM_STARS_SQL,
  PAYMENT_LEDGER_TABLE_SQL,
  ...PAYMENT_LEDGER_INDEXES_SQL,
];

import { PaymentLedgerService } from './payment-ledger.service';

describe('PaymentLedgerService idempotency', () => {
  it('returns existing pending row instead of duplicating', async () => {
    const rows = new Map<string, any>();
    const prisma = {
      paymentLedger: {
        create: async ({ data }: any) => {
          if ([...rows.values()].some((r) => r.idempotencyKey === data.idempotencyKey)) {
            const err: any = new Error('unique');
            err.code = 'P2002';
            throw err;
          }
          const row = {
            id: `id_${rows.size + 1}`,
            providerChargeId: null,
            metadata: data.metadata ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          rows.set(row.id, row);
          return row;
        },
        findUnique: async ({ where }: any) => {
          if (where.idempotencyKey) {
            return [...rows.values()].find((r) => r.idempotencyKey === where.idempotencyKey) || null;
          }
          if (where.providerChargeId) {
            return [...rows.values()].find((r) => r.providerChargeId === where.providerChargeId) || null;
          }
          return rows.get(where.id) || null;
        },
        findMany: async () => [...rows.values()],
        update: async ({ where, data }: any) => {
          const current = [...rows.values()].find((r) => r.id === where.id || r.idempotencyKey === where.idempotencyKey);
          if (!current) throw new Error('missing');
          if (data.providerChargeId && [...rows.values()].some((r) => r.providerChargeId === data.providerChargeId && r.id !== current.id)) {
            const err: any = new Error('unique');
            err.code = 'P2002';
            throw err;
          }
          Object.assign(current, data, { updatedAt: new Date() });
          return current;
        },
      },
    };
    const svc = new PaymentLedgerService(prisma as any);
    const first = await svc.createPending({
      adminId: 'a1',
      gateway: 'telegram_stars',
      surface: 'store',
      orderId: 'o1',
      idempotencyKey: 'telegram_stars:store:o1',
      amount: 10,
      currency: 'XTR',
    });
    const second = await svc.createPending({
      adminId: 'a1',
      gateway: 'telegram_stars',
      surface: 'store',
      orderId: 'o1',
      idempotencyKey: 'telegram_stars:store:o1',
      amount: 10,
      currency: 'XTR',
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);

    const paid = await svc.markPaid({
      idempotencyKey: 'telegram_stars:store:o1',
      providerChargeId: 'tg_charge_1',
    });
    expect(paid.duplicate).toBe(false);
    expect(paid.row.status).toBe('paid');

    const again = await svc.markPaid({
      idempotencyKey: 'telegram_stars:store:o1',
      providerChargeId: 'tg_charge_1',
    });
    expect(again.duplicate).toBe(true);
    expect(again.row.status).toBe('paid');
  });
});

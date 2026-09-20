import {
  aggregateDailyUsage,
  computeTimeDelta,
  computeTimeExpiryMs,
  computeVolumeDelta,
  computeVolumeTotalBytes,
  isDuplicateMeterCursor,
  PAYG_GB,
  PAYG_MS_PER_HOUR,
  resolvePricePerByte,
  resolvePricePerHour,
  resolvePricePerMs,
  volumeMeterCursorKey,
} from './payg-math.util';

describe('payg math helpers', () => {
  describe('VOLUME affordance', () => {
    it('computes total = used + floor(balance / pricePerByte)', () => {
      const pricePerGb = 10;
      const pricePerByte = resolvePricePerByte({ billingMode: 'VOLUME', pricePerGb })!;
      expect(pricePerByte).toBeCloseTo(10 / PAYG_GB);

      const used = 2 * PAYG_GB;
      const balance = 25; // 2.5 GB worth
      const total = computeVolumeTotalBytes(used, balance, pricePerByte)!;
      expect(total).toBe(used + Math.floor(25 / pricePerByte));
      expect(total - used).toBe(Math.floor(2.5 * PAYG_GB));
    });

    it('charges only positive delta from meter cursor', () => {
      const pricePerByte = 10 / PAYG_GB;
      const used = 5n * BigInt(PAYG_GB);
      const cursor = 3n * BigInt(PAYG_GB);
      const delta = computeVolumeDelta({
        usedBytes: used,
        meterCursorBytes: cursor,
        pricePerByte,
      })!;
      expect(delta.deltaBytes).toBe(2 * PAYG_GB);
      expect(delta.quantityGb).toBeCloseTo(2);
      expect(delta.amount).toBeCloseTo(20);
      expect(delta.nextCursor).toBe(used);
    });

    it('does not charge when usage reset below cursor', () => {
      const pricePerByte = 10 / PAYG_GB;
      const delta = computeVolumeDelta({
        usedBytes: 100,
        meterCursorBytes: 1000,
        pricePerByte,
      })!;
      expect(delta.deltaBytes).toBe(0);
      expect(delta.amount).toBe(0);
      expect(delta.nextCursor).toBe(1000n);
    });
  });

  describe('TIME affordance', () => {
    it('resolves hourly price from day rate', () => {
      expect(resolvePricePerHour({ billingMode: 'TIME', pricePerDay: 24 })).toBe(1);
      expect(resolvePricePerHour({ billingMode: 'TIME', pricePerHour: 2 })).toBe(2);
    });

    it('computes expiry = now + floor(balance / pricePerMs)', () => {
      const pricePerMs = resolvePricePerMs({ billingMode: 'TIME', pricePerHour: 1 })!;
      expect(pricePerMs).toBeCloseTo(1 / PAYG_MS_PER_HOUR);
      const now = 1_700_000_000_000;
      const balance = 3; // 3 hours
      const expiry = computeTimeExpiryMs(now, balance, pricePerMs)!;
      expect(expiry - now).toBe(3 * PAYG_MS_PER_HOUR);
    });

    it('charges elapsed hours between bill marks', () => {
      const from = 1_000_000;
      const to = from + 2.5 * PAYG_MS_PER_HOUR;
      const delta = computeTimeDelta({ fromMs: from, toMs: to, pricePerHour: 4 })!;
      expect(delta.quantityHours).toBeCloseTo(2.5);
      expect(delta.amount).toBeCloseTo(10);
      expect(delta.meterCursor).toBe(`time:${Math.floor(to)}`);
    });
  });

  describe('idempotency', () => {
    it('detects duplicate meter cursors', () => {
      const cursor = volumeMeterCursorKey(12345n);
      expect(isDuplicateMeterCursor(['vol:1', cursor], cursor)).toBe(true);
      expect(isDuplicateMeterCursor(['vol:1'], cursor)).toBe(false);
    });
  });

  describe('daily aggregation', () => {
    it('buckets by UTC day and kind', () => {
      const rows = aggregateDailyUsage([
        {
          createdAt: '2026-09-20T01:00:00.000Z',
          kind: 'VOLUME',
          quantity: 1,
          amount: 10,
        },
        {
          createdAt: '2026-09-20T23:00:00.000Z',
          kind: 'VOLUME',
          quantity: 0.5,
          amount: 5,
        },
        {
          createdAt: '2026-09-21T00:30:00.000Z',
          kind: 'TIME',
          quantity: 2,
          amount: 8,
        },
      ]);
      expect(rows).toEqual([
        { day: '2026-09-20', kind: 'VOLUME', quantity: 1.5, amount: 15, entries: 2 },
        { day: '2026-09-21', kind: 'TIME', quantity: 2, amount: 8, entries: 1 },
      ]);
    });
  });
});

import {
  parsePaymentManagementState,
  migratePaymentManagementState,
  snapshotMethods,
  defaultPaymentManagementState,
} from './payment-management.state';
import { deriveMethodUiStatus } from './payment-catalog';
import { amountToStars, decodeStarsPayload, encodeStarsPayload } from './telegram-stars.util';
import { mergeLegacyCards, pickAssignedCards } from './payment-cards';
import { parsePaymentSurfaceAssignments } from './payment-surface';

describe('payment management state', () => {
  it('defaults keep card-to-card and wallet on, Stars off', () => {
    const state = defaultPaymentManagementState();
    expect(state.methods.manual_bank.enabled).toBe(true);
    expect(state.methods.wallet.enabled).toBe(true);
    expect(state.methods.telegram_stars.enabled).toBe(false);
    expect(state.methods.crypto_gateway.enabled).toBe(false);
    expect(state.methods.rial_gateway.enabled).toBe(false);
  });

  it('migrates store and recharge cards without dropping ids', () => {
    const migrated = migratePaymentManagementState(defaultPaymentManagementState(), {
      storeCards: [
        { id: 'store_a', bankName: 'Melli', cardNumber: '6037991111111111', cardHolder: 'Ali' },
      ],
      rechargeCards: [
        { id: 'recharge_b', bankName: 'Saderat', cardNumber: '6274122222222222', cardHolder: 'Sara' },
        { id: 'dup', cardNumber: '6037991111111111' },
      ],
    });
    expect(migrated.initialized).toBe(true);
    expect(migrated.cards).toHaveLength(2);
    expect(migrated.cards[0].cardNumber).toBe('6037991111111111');
    expect(migrated.cards[1].cardNumber).toBe('6274122222222222');
    expect(migrated.assignments.find((a) => a.surface === 'store')?.cardId).toBe('store_a');
  });

  it('does not re-migrate when already initialized with cards', () => {
    const first = migratePaymentManagementState(defaultPaymentManagementState(), {
      storeCards: [{ id: 'a', cardNumber: '1111222233334444', bankName: 'A' }],
    });
    const second = migratePaymentManagementState(first, {
      storeCards: [{ id: 'b', cardNumber: '9999888877776666', bankName: 'B' }],
    });
    expect(second.cards).toHaveLength(1);
    expect(second.cards[0].id).toBe('a');
  });

  it('parses assignments with cardId', () => {
    const parsed = parsePaymentManagementState({
      initialized: true,
      assignments: [
        {
          surface: 'add_balance',
          allowedGatewayIds: ['manual_bank'],
          defaultId: 'manual_bank',
          cardId: 'card_3',
        },
      ],
      cards: [{ id: 'card_3', title: 'Card 3', cardNumber: '5022290000000000' }],
    });
    expect(parsed.assignments.find((a) => a.surface === 'add_balance')?.cardId).toBe('card_3');
    expect(parsePaymentSurfaceAssignments(parsed.assignments).find((a) => a.surface === 'store')?.defaultId).toBe(
      'manual_bank',
    );
  });

  it('snapshots method statuses', () => {
    const state = parsePaymentManagementState({
      methods: { telegram_stars: { enabled: true }, manual_bank: { enabled: false } },
      cards: [{ id: 'c1', cardNumber: '6037990000000000', enabled: true }],
    });
    const snap = snapshotMethods(state, { starsConfigured: true, cardsConfigured: true });
    expect(snap.find((m) => m.id === 'telegram_stars')?.status).toBe('active');
    expect(snap.find((m) => m.id === 'manual_bank')?.status).toBe('disabled');
    expect(snap.find((m) => m.id === 'crypto_gateway')?.status).toBe('not_configured');
  });
});

describe('payment catalog status', () => {
  it('maps enabled+configured to active', () => {
    expect(deriveMethodUiStatus({ kind: 'implemented', enabled: true, configured: true })).toBe('active');
    expect(deriveMethodUiStatus({ kind: 'implemented', enabled: false, configured: true })).toBe('disabled');
    expect(deriveMethodUiStatus({ kind: 'implemented', enabled: true, configured: false })).toBe(
      'not_configured',
    );
  });
});

describe('telegram stars helpers', () => {
  it('encodes and decodes compact payloads', () => {
    const payload = encodeStarsPayload('store', 'ord-1');
    expect(payload.length).toBeLessThanOrEqual(128);
    expect(decodeStarsPayload(payload)).toEqual({ surface: 'store', orderId: 'ord-1' });
    expect(decodeStarsPayload('garbage')).toBeNull();
  });

  it('converts amounts to integer Stars', () => {
    expect(amountToStars(10, 'USD', { starsPerUsd: 50, starsPerIrt: 0.002 })).toBe(500);
    expect(amountToStars(150000, 'TOMAN', { starsPerUsd: 50, starsPerIrt: 0.002 })).toBe(300);
    expect(amountToStars(0, 'USD', { starsPerUsd: 50, starsPerIrt: 0.002 })).toBe(1);
  });
});

describe('card assignment', () => {
  it('picks the assigned card for a surface', () => {
    const cards = mergeLegacyCards([
      [
        { id: 'c1', title: 'Card 1', cardNumber: '1111222233334444', enabled: true },
        { id: 'c2', title: 'Card 2', cardNumber: '5555666677778888', enabled: true },
      ],
    ]);
    expect(pickAssignedCards(cards, 'c2').map((c) => c.id)).toEqual(['c2']);
  });
});

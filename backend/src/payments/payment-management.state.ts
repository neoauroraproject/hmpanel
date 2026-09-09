import {
  DEFAULT_PAYMENT_SURFACE_ASSIGNMENTS,
  parsePaymentSurfaceAssignments,
  type PaymentSurface,
  type PaymentSurfaceAssignment,
} from './payment-surface';
import {
  PAYMENT_METHOD_CATALOG,
  deriveMethodUiStatus,
  type PaymentMethodId,
  type PaymentMethodKind,
  type PaymentMethodUiStatus,
} from './payment-catalog';
import {
  mergeLegacyCards,
  newPaymentBankCard,
  normalizePaymentBankCards,
  type PaymentBankCard,
} from './payment-cards';

export const PAYMENT_MANAGEMENT_KEY_PREFIX = 'payment_management_v1:';

export function paymentManagementSettingKey(adminId: string): string {
  return `${PAYMENT_MANAGEMENT_KEY_PREFIX}${adminId}`;
}

export type TelegramStarsBotBinding = 'store' | 'platform';

export type TelegramStarsPluginSettings = {
  enabled: boolean;
  botBinding: TelegramStarsBotBinding;
  starsPerUsd: number;
  starsPerIrt: number;
  invoiceTitle: string;
  invoiceDescription: string;
  lastProbe?: {
    ok: boolean;
    username?: string | null;
    error?: string | null;
    at?: string | null;
  } | null;
};

export type PaymentMethodState = {
  id: PaymentMethodId;
  enabled: boolean;
  configured: boolean;
  kind: PaymentMethodKind;
  status: PaymentMethodUiStatus;
};

export type PaymentManagementState = {
  initialized: boolean;
  migratedAt?: string | null;
  methods: Record<PaymentMethodId, { enabled: boolean }>;
  cards: PaymentBankCard[];
  assignments: PaymentSurfaceAssignment[];
  stars: TelegramStarsPluginSettings;
};

export const DEFAULT_STARS_SETTINGS: TelegramStarsPluginSettings = {
  enabled: false,
  botBinding: 'store',
  starsPerUsd: 50,
  starsPerIrt: 0.002,
  invoiceTitle: 'HMPanel',
  invoiceDescription: 'Payment',
  lastProbe: null,
};

function defaultMethodEnables(): Record<PaymentMethodId, { enabled: boolean }> {
  const methods = {} as Record<PaymentMethodId, { enabled: boolean }>;
  for (const entry of PAYMENT_METHOD_CATALOG) {
    methods[entry.id] = {
      enabled: entry.id === 'manual_bank' || entry.id === 'wallet',
    };
  }
  return methods;
}

export function defaultPaymentManagementState(): PaymentManagementState {
  return {
    initialized: false,
    migratedAt: null,
    methods: defaultMethodEnables(),
    cards: [],
    assignments: DEFAULT_PAYMENT_SURFACE_ASSIGNMENTS.map((row) => ({ ...row })),
    stars: { ...DEFAULT_STARS_SETTINGS },
  };
}

function parseStars(raw: unknown): TelegramStarsPluginSettings {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const binding = rec.botBinding === 'platform' ? 'platform' : 'store';
  const starsPerUsd = Number(rec.starsPerUsd);
  const starsPerIrt = Number(rec.starsPerIrt);
  return {
    enabled: rec.enabled === true,
    botBinding: binding,
    starsPerUsd: Number.isFinite(starsPerUsd) && starsPerUsd > 0 ? starsPerUsd : DEFAULT_STARS_SETTINGS.starsPerUsd,
    starsPerIrt: Number.isFinite(starsPerIrt) && starsPerIrt > 0 ? starsPerIrt : DEFAULT_STARS_SETTINGS.starsPerIrt,
    invoiceTitle: String(rec.invoiceTitle || DEFAULT_STARS_SETTINGS.invoiceTitle).slice(0, 32),
    invoiceDescription: String(rec.invoiceDescription || DEFAULT_STARS_SETTINGS.invoiceDescription).slice(0, 255),
    lastProbe:
      rec.lastProbe && typeof rec.lastProbe === 'object'
        ? {
            ok: (rec.lastProbe as { ok?: boolean }).ok === true,
            username: String((rec.lastProbe as { username?: string }).username || '') || null,
            error: String((rec.lastProbe as { error?: string }).error || '') || null,
            at: String((rec.lastProbe as { at?: string }).at || '') || null,
          }
        : null,
  };
}

export function parsePaymentManagementState(raw: unknown): PaymentManagementState {
  const base = defaultPaymentManagementState();
  if (!raw || typeof raw !== 'object') return base;
  const rec = raw as Record<string, unknown>;
  const methods = defaultMethodEnables();
  if (rec.methods && typeof rec.methods === 'object') {
    const incoming = rec.methods as Record<string, unknown>;
    for (const entry of PAYMENT_METHOD_CATALOG) {
      const row = incoming[entry.id];
      if (row && typeof row === 'object' && typeof (row as { enabled?: unknown }).enabled === 'boolean') {
        methods[entry.id] = { enabled: (row as { enabled: boolean }).enabled };
      } else if (typeof row === 'boolean') {
        methods[entry.id] = { enabled: row };
      }
    }
  }
  if (rec.stars && typeof rec.stars === 'object') {
    const starsEnabled = (rec.stars as { enabled?: boolean }).enabled === true;
    if (starsEnabled) methods.telegram_stars = { enabled: true };
  }
  return {
    initialized: rec.initialized === true,
    migratedAt: rec.migratedAt ? String(rec.migratedAt) : null,
    methods,
    cards: normalizePaymentBankCards(rec.cards),
    assignments: parsePaymentSurfaceAssignments(rec.assignments),
    stars: parseStars(rec.stars),
  };
}

export type LegacyPaymentSources = {
  storeCards?: unknown;
  storeManualBankEnabled?: boolean;
  rechargeCards?: unknown;
  rechargeManualBankEnabled?: boolean;
};

/**
 * First-load merge: copy existing store / recharge cards into the central catalog
 * without deleting the originals. Defaults keep card-to-card + wallet on.
 */
export function migratePaymentManagementState(
  current: PaymentManagementState,
  legacy: LegacyPaymentSources,
): PaymentManagementState {
  if (current.initialized && current.cards.length) {
    return current;
  }
  const cards = current.cards.length
    ? current.cards
    : mergeLegacyCards([legacy.storeCards, legacy.rechargeCards]);
  const methods = { ...current.methods };
  if (legacy.storeManualBankEnabled === false && legacy.rechargeManualBankEnabled === false) {
    methods.manual_bank = { enabled: false };
  } else {
    methods.manual_bank = { enabled: true };
  }
  const firstCard = cards.find((c) => c.enabled !== false) || cards[0];
  const assignments = current.assignments.map((row) => {
    if (row.surface === 'store' || row.surface === 'add_balance') {
      return {
        ...row,
        cardId: row.cardId || firstCard?.id || null,
        allowedGatewayIds: row.allowedGatewayIds.length
          ? row.allowedGatewayIds
          : ['manual_bank', 'wallet'],
      };
    }
    return { ...row, cardId: row.cardId || firstCard?.id || null };
  });
  return {
    ...current,
    initialized: true,
    migratedAt: current.migratedAt || new Date().toISOString(),
    methods,
    cards,
    assignments,
  };
}

export function applyCardTitles(cards: PaymentBankCard[]): PaymentBankCard[] {
  return cards.map((card, index) => ({
    ...card,
    title: card.title?.trim() || `Card ${index + 1}`,
  }));
}

export function upsertCard(
  cards: PaymentBankCard[],
  patch: Partial<PaymentBankCard> & { id?: string },
): PaymentBankCard[] {
  if (patch.id) {
    const exists = cards.some((c) => c.id === patch.id);
    if (exists) {
      return applyCardTitles(
        cards.map((c) => (c.id === patch.id ? { ...c, ...normalizePaymentBankCards([{ ...c, ...patch }])[0] } : c)),
      );
    }
  }
  const created = newPaymentBankCard(patch);
  return applyCardTitles([...cards, created]);
}

export type MethodSnapshot = PaymentMethodState & {
  label: string;
  description: string;
  gatewayId: string;
};

export function snapshotMethods(
  state: PaymentManagementState,
  extras: { starsConfigured: boolean; cardsConfigured: boolean },
): MethodSnapshot[] {
  return PAYMENT_METHOD_CATALOG.map((entry) => {
    const enabled = state.methods[entry.id]?.enabled === true;
    const configured =
      entry.id === 'telegram_stars'
        ? extras.starsConfigured
        : entry.id === 'manual_bank'
          ? extras.cardsConfigured
          : entry.id === 'wallet'
            ? true
            : false;
    const kind = entry.kind;
    const status = deriveMethodUiStatus({ kind, enabled, configured });
    return {
      id: entry.id,
      enabled: kind === 'future' ? false : enabled,
      configured,
      kind,
      status,
      label: entry.label,
      description: entry.description,
      gatewayId: entry.gatewayId,
    };
  });
}

export function assignmentUsesMethod(
  assignment: PaymentSurfaceAssignment,
  methodId: string,
): boolean {
  return assignment.allowedGatewayIds.includes(methodId);
}

export function surfaceLabel(surface: PaymentSurface): string {
  if (surface === 'store') return 'Store';
  if (surface === 'add_balance') return 'Add Balance';
  return 'Subscription Renewal';
}

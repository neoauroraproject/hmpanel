export type StorePaymentMethodId = 'manual_bank';

export type StoreBankCard = {
  id: string;
  bankName?: string;
  cardNumber?: string;
  cardHolder?: string;
  iban?: string;
  instructions?: string;
  enabled?: boolean;
};

export type StorePaymentConfig = {
  methods: Partial<Record<StorePaymentMethodId, boolean>>;
  cards: StoreBankCard[];
};

export const STORE_PAYMENT_METHOD_META: Array<{
  id: StorePaymentMethodId;
  label: string;
  description: string;
  available: boolean;
}> = [
  {
    id: 'manual_bank',
    label: 'Card to Card',
    description: 'Show bank cards for manual transfer. Customers upload receipt / tracking code.',
    available: true,
  },
];

export function newBankCard(partial?: Partial<StoreBankCard>): StoreBankCard {
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    bankName: '',
    cardNumber: '',
    cardHolder: '',
    iban: '',
    instructions: '',
    enabled: true,
    ...partial,
  };
}

export function normalizePaymentConfig(
  raw?: unknown,
  legacy?: {
    bankName?: string | null;
    bankCardNumber?: string | null;
    bankCardHolder?: string | null;
    bankIban?: string | null;
    paymentInstructions?: string | null;
  },
): StorePaymentConfig {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as Partial<StorePaymentConfig>;
  const methods: StorePaymentConfig['methods'] = {
    manual_bank: parsed.methods?.manual_bank !== false,
  };
  let cards = Array.isArray(parsed.cards)
    ? parsed.cards
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
          id: String((c as StoreBankCard).id || newBankCard().id),
          bankName: String((c as StoreBankCard).bankName || ''),
          cardNumber: String((c as StoreBankCard).cardNumber || ''),
          cardHolder: String((c as StoreBankCard).cardHolder || ''),
          iban: String((c as StoreBankCard).iban || ''),
          instructions: String((c as StoreBankCard).instructions || ''),
          enabled: (c as StoreBankCard).enabled !== false,
        }))
    : [];

  if (
    !cards.length &&
    (legacy?.bankCardNumber || legacy?.bankName || legacy?.paymentInstructions)
  ) {
    cards = [
      newBankCard({
        bankName: legacy?.bankName || '',
        cardNumber: legacy?.bankCardNumber || '',
        cardHolder: legacy?.bankCardHolder || '',
        iban: legacy?.bankIban || '',
        instructions: legacy?.paymentInstructions || '',
        enabled: true,
      }),
    ];
  }

  return { methods, cards };
}

export function primaryCardFromConfig(config: StorePaymentConfig): StoreBankCard | null {
  return config.cards.find((c) => c.enabled !== false) || config.cards[0] || null;
}

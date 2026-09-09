export type PaymentBankCard = {
  id: string;
  title: string;
  bankName: string;
  cardNumber: string;
  cardHolder: string;
  iban: string;
  instructions: string;
  enabled: boolean;
};

export function toLatinDigits(input: string): string {
  return String(input || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function normalizeCardNumber(raw: string): string {
  return toLatinDigits(raw).replace(/[^\d]/g, '');
}

export function newPaymentBankCard(
  partial?: Partial<PaymentBankCard>,
): PaymentBankCard {
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    bankName: '',
    cardNumber: '',
    cardHolder: '',
    iban: '',
    instructions: '',
    enabled: true,
    ...partial,
  };
}

export function normalizePaymentBankCard(raw: unknown): PaymentBankCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const cardNumber = normalizeCardNumber(String(rec.cardNumber || ''));
  const title = String(rec.title || rec.bankName || '').trim();
  return {
    id: String(rec.id || newPaymentBankCard().id),
    title,
    bankName: String(rec.bankName || '').trim(),
    cardNumber,
    cardHolder: String(rec.cardHolder || '').trim(),
    iban: toLatinDigits(String(rec.iban || '')).replace(/\s+/g, '').trim(),
    instructions: String(rec.instructions || '').trim(),
    enabled: rec.enabled !== false,
  };
}

export function normalizePaymentBankCards(raw: unknown): PaymentBankCard[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentBankCard[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const card = normalizePaymentBankCard(item);
    if (!card) continue;
    const key = card.cardNumber.length >= 8 ? card.cardNumber : card.id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!card.title) {
      card.title = `Card ${out.length + 1}`;
    }
    out.push(card);
  }
  return out;
}

export function mergeLegacyCards(
  batches: unknown[],
): PaymentBankCard[] {
  return normalizePaymentBankCards(batches.flatMap((b) => (Array.isArray(b) ? b : [])));
}

export function pickAssignedCards(
  cards: PaymentBankCard[],
  cardId?: string | null,
): PaymentBankCard[] {
  const enabled = cards.filter((c) => c.enabled !== false);
  if (cardId) {
    const match = enabled.find((c) => c.id === cardId) || cards.find((c) => c.id === cardId);
    return match ? [match] : enabled;
  }
  return enabled;
}

export function cardIsUsable(card: PaymentBankCard): boolean {
  return (
    card.enabled !== false &&
    Boolean(card.cardNumber || card.bankName || card.iban || card.instructions || card.cardHolder)
  );
}

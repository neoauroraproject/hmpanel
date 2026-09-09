export type PaymentSurface = 'store' | 'add_balance' | 'renewal';

export type PaymentSurfaceAssignment = {
  surface: PaymentSurface;
  allowedGatewayIds: string[];
  defaultId: string;
  /** When Card to Card is assigned, which catalog card this surface uses. */
  cardId?: string | null;
};

export const PAYMENT_SURFACE_SETTING_KEY = 'payment_surface_assignment';

export const DEFAULT_PAYMENT_SURFACE_ASSIGNMENTS: PaymentSurfaceAssignment[] = [
  {
    surface: 'store',
    allowedGatewayIds: ['manual_bank', 'wallet'],
    defaultId: 'manual_bank',
  },
  {
    surface: 'add_balance',
    allowedGatewayIds: ['manual_bank', 'wallet'],
    defaultId: 'manual_bank',
  },
  {
    surface: 'renewal',
    allowedGatewayIds: ['wallet', 'manual_bank'],
    defaultId: 'wallet',
  },
];

const SURFACES: PaymentSurface[] = ['store', 'add_balance', 'renewal'];

export function parsePaymentSurfaceAssignments(
  raw: unknown,
): PaymentSurfaceAssignment[] {
  const bySurface = new Map(
    DEFAULT_PAYMENT_SURFACE_ASSIGNMENTS.map((row) => [row.surface, { ...row }]),
  );
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const surface = rec.surface as PaymentSurface;
      if (!SURFACES.includes(surface)) continue;
      const allowed = Array.isArray(rec.allowedGatewayIds)
        ? rec.allowedGatewayIds.map(String).filter(Boolean)
        : bySurface.get(surface)!.allowedGatewayIds;
      const defaultId = String(rec.defaultId || allowed[0] || '');
      const cardId =
        rec.cardId === null || rec.cardId === undefined || rec.cardId === ''
          ? rec.cardId === null
            ? null
            : bySurface.get(surface)!.cardId
          : String(rec.cardId);
      bySurface.set(surface, {
        surface,
        allowedGatewayIds: allowed.length ? allowed : [defaultId].filter(Boolean),
        defaultId: allowed.includes(defaultId) ? defaultId : allowed[0] || defaultId,
        cardId: cardId ?? null,
      });
    }
  }
  return SURFACES.map((surface) => bySurface.get(surface)!);
}

export function resolveSurfaceGateways(
  assignments: PaymentSurfaceAssignment[],
  surface: PaymentSurface,
  registeredIds: string[],
): { gateways: string[]; default: string; cardId: string | null } {
  const fallback = registeredIds.length ? registeredIds : ['manual_bank'];
  const row = assignments.find((a) => a.surface === surface);
  if (!row) {
    return {
      gateways: fallback,
      default: fallback.includes('manual_bank') ? 'manual_bank' : fallback[0],
      cardId: null,
    };
  }
  const allowed = row.allowedGatewayIds.filter(
    (id) => !registeredIds.length || registeredIds.includes(id),
  );
  const gateways = allowed.length ? allowed : fallback;
  const defaultId = gateways.includes(row.defaultId) ? row.defaultId : gateways[0];
  return { gateways, default: defaultId, cardId: row.cardId || null };
}

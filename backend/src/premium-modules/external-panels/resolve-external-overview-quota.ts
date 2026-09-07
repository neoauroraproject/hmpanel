export type PanelQuotaSlice = {
  totalAssigned: number;
  balance: number;
  maxClients: number;
};

export type OverviewQuota = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  capacity: number;
  unlimited: boolean;
};

/**
 * Community panel cards (AdminPanelQuota) are the source of truth for reseller
 * caps. Provider-access rows used to default to unlimited and overwrite the KPI.
 */
export function overlayPanelQuotasOnOverview(
  base: Omit<OverviewQuota, 'availableBytes'> & { availableBytes?: number },
  panelQuotas: PanelQuotaSlice[],
  isSuper: boolean,
): OverviewQuota {
  const availableFromBase = Math.max(0, base.totalBytes - base.usedBytes);
  const fallback: OverviewQuota = {
    totalBytes: base.unlimited ? 0 : base.totalBytes,
    usedBytes: base.unlimited ? 0 : base.usedBytes,
    availableBytes: base.unlimited
      ? Number.MAX_SAFE_INTEGER
      : availableFromBase,
    capacity: base.capacity,
    unlimited: base.unlimited,
  };

  if (isSuper || !panelQuotas.length) return fallback;

  const totalBytes = panelQuotas.reduce(
    (sum, row) => sum + Number(row.totalAssigned || 0),
    0,
  );
  const available = panelQuotas.reduce(
    (sum, row) => sum + Number(row.balance || 0),
    0,
  );
  const assigned = totalBytes > 0 || available > 0;
  const unlimited = !assigned;
  const caps = panelQuotas.map((row) => Number(row.maxClients || 0));
  const capacity = caps.some((cap) => cap > 0)
    ? caps.reduce((sum, cap) => sum + cap, 0)
    : 0;

  return {
    totalBytes: unlimited ? 0 : totalBytes,
    usedBytes: unlimited ? 0 : Math.max(0, totalBytes - available),
    availableBytes: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, available),
    capacity,
    unlimited,
  };
}

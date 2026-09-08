export function calculateAdminTrafficSummary(
  totalAssigned: number | bigint,
  balance: number | bigint,
) {
  const total = Number(totalAssigned) || 0;
  const available = Number(balance) || 0;
  const used = Math.max(0, total - available);

  return {
    totalAllocated: total,
    availableTraffic: available,
    usedTraffic: used,
    usagePercent: total > 0 ? (used / total) * 100 : 0,
  };
}

/** Sum per-panel pool used/assigned (PER_PANEL). Do not use Admin.balance here. */
export function sumPanelQuotaTraffic(
  quotas: Array<{
    totalAssigned?: number | bigint;
    balance?: number | bigint;
    usedTraffic?: number;
  }>,
) {
  const totalAllocated = quotas.reduce(
    (sum, row) => sum + (Number(row.totalAssigned) || 0),
    0,
  );
  const usedTraffic = quotas.reduce((sum, row) => {
    if (typeof row.usedTraffic === 'number' && Number.isFinite(row.usedTraffic)) {
      return sum + row.usedTraffic;
    }
    return (
      sum +
      calculateAdminTrafficSummary(row.totalAssigned ?? 0, row.balance ?? 0)
        .usedTraffic
    );
  }, 0);
  return { totalAllocated, usedTraffic };
}

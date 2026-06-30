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

export type QuotaLedgerAction =
  | 'ADMIN_INITIAL_ALLOCATION'
  | 'ADMIN_RECHARGE'
  | 'ADMIN_DEDUCTION';

export function nextQuotaLedger(
  existing: { balance: number; totalAssigned: number } | null,
  nextBalance: number,
): {
  balance: number;
  totalAssigned: number | undefined;
  totalAssignedIncrement: number;
  diff: number;
  action: QuotaLedgerAction | null;
} {
  const balance = Math.max(0, Math.round(Number(nextBalance) || 0));
  if (!existing) {
    return {
      balance,
      totalAssigned: balance,
      totalAssignedIncrement: 0,
      diff: balance,
      action: balance > 0 ? 'ADMIN_INITIAL_ALLOCATION' : null,
    };
  }
  const diff = balance - existing.balance;
  return {
    balance,
    totalAssigned: undefined,
    totalAssignedIncrement: diff > 0 ? diff : 0,
    diff,
    action: diff > 0 ? 'ADMIN_RECHARGE' : diff < 0 ? 'ADMIN_DEDUCTION' : null,
  };
}

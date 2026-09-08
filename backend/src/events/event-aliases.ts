export const EVENT_ALIASES: Record<string, string[]> = {
  'client.created': ['user.created', 'subscription.created'],
  'client.updated': ['user.updated', 'subscription.updated'],
  'client.deleted': ['user.deleted', 'subscription.expired'],
  'payment.verified': ['payment.completed'],
  'order.paid': ['order.completed'],
};

export const WEBHOOK_EVENT_ALLOWLIST = new Set<string>([
  'client.created',
  'client.updated',
  'client.deleted',
  'user.created',
  'user.updated',
  'user.deleted',
  'user.expiring',
  'user.expired',
  'subscription.created',
  'subscription.updated',
  'subscription.expiring',
  'subscription.expired',
  'payment.verified',
  'payment.completed',
  'payment.failed',
  'order.created',
  'order.paid',
  'order.completed',
  'traffic.debited',
  'admin.created',
  'panel.synced',
  'theme.published',
]);

export function aliasesFor(type: string): string[] {
  return EVENT_ALIASES[type] || [];
}

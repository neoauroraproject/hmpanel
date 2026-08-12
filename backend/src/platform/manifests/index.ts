import type { ModuleManifest } from '../types/module-manifest.types';

export const MODULE_MANIFESTS: ModuleManifest[] = [
  {
    id: 'branding',
    name: 'Branding',
    version: '1.0.0',
    description: 'White-label portal appearance and subscription themes.',
    kind: 'BUSINESS',
    phase: 1,
    defaultEnabled: true,
    licenseRequirement: 'business',
    features: ['WHITE_LABEL'],
    dependencies: [],
    permissions: [
      { id: 'branding.view', description: 'View branding settings' },
      { id: 'branding.edit', description: 'Edit branding', write: true },
    ],
    routes: { backend: '/premium-modules/branding', frontend: '/premium/branding' },
    menus: [{ label: 'Branding', path: '/premium/branding', icon: 'Brush' }],
    scheduler: [],
    readOnlyCapabilities: {
      read: ['view_branding', 'active_branding'],
      write: ['edit_branding'],
    },
  },
  {
    id: 'custom-domains',
    name: 'Custom Domains',
    version: '1.0.0',
    description: 'Per-admin domains with SSL.',
    kind: 'BUSINESS',
    phase: 1,
    defaultEnabled: true,
    licenseRequirement: 'business',
    features: ['CUSTOM_DOMAINS'],
    dependencies: [],
    permissions: [
      { id: 'domains.view', description: 'View domains' },
      { id: 'domains.manage', description: 'Manage domains', write: true },
    ],
    routes: { backend: '/domains', frontend: '/premium/domains' },
    menus: [{ label: 'Custom Domains', path: '/premium/domains', icon: 'Globe' }],
    scheduler: [],
    readOnlyCapabilities: {
      read: ['view_domains', 'use_existing_ssl'],
      write: ['add_domain', 'issue_ssl', 'change_domain'],
    },
  },
  {
    id: 'client-templates',
    name: 'Client Templates',
    version: '1.0.0',
    description: 'Quick-create presets for clients: pick a template, type a name, create.',
    kind: 'BUSINESS',
    phase: 1,
    defaultEnabled: true,
    licenseRequirement: 'business',
    features: [],
    dependencies: [],
    permissions: [
      { id: 'client-templates.view', description: 'View client templates' },
      { id: 'client-templates.manage', description: 'Manage client templates', write: true },
    ],
    routes: { backend: '/premium-modules/client-templates', frontend: '/premium/client-templates' },
    menus: [{ label: 'Client Templates', path: '/premium/client-templates', icon: 'LayoutTemplate' }],
    scheduler: [],
    readOnlyCapabilities: {
      read: ['view_client_templates'],
      write: ['manage_client_templates'],
    },
  },
  {
    id: 'store',
    name: 'Store',
    version: '1.0.0',
    description: 'Order management and customer portal.',
    kind: 'BUSINESS',
    phase: 2,
    defaultEnabled: false,
    licenseRequirement: 'business',
    features: ['CUSTOM_SUBSCRIPTION_PORTAL'],
    dependencies: ['branding'],
    permissions: [
      { id: 'store.view', description: 'View store data' },
      { id: 'store.manage', description: 'Manage store', write: true },
    ],
    routes: { backend: '/premium-modules/store', frontend: '/premium/store' },
    menus: [{ label: 'Store', path: '/premium/store', icon: 'Store' }],
    scheduler: [],
    readOnlyCapabilities: {
      read: ['view_orders', 'view_products', 'view_reports'],
      write: ['create_order', 'manage_products', 'provision'],
    },
  },
  {
    id: 'admin-recharge',
    name: 'Admin Recharge',
    version: '1.0.0',
    description: 'Reseller credit top-up plans with manual payment approval.',
    kind: 'BUSINESS',
    phase: 2,
    defaultEnabled: false,
    licenseRequirement: 'business',
    features: [],
    dependencies: [],
    permissions: [
      { id: 'admin-recharge.view', description: 'View recharge catalog and orders' },
      { id: 'admin-recharge.manage', description: 'Manage plans and approve orders', write: true },
    ],
    routes: { backend: '/premium-modules/admin-recharge', frontend: '/premium/admin-recharge' },
    menus: [{ label: 'Admin Recharge', path: '/premium/admin-recharge', icon: 'Wallet' }],
    scheduler: [],
    readOnlyCapabilities: {
      read: ['view_plans', 'view_orders', 'view_finance'],
      write: ['manage_plans', 'approve_orders', 'submit_order'],
    },
  },
  {
    id: 'monitoring-pro',
    name: 'Monitoring Pro',
    version: '1.0.0',
    description: 'Infrastructure monitoring, incidents, and automation.',
    kind: 'PLATFORM',
    phase: 3,
    defaultEnabled: false,
    licenseRequirement: 'platform',
    features: ['ADVANCED_ANALYTICS', 'SMART_ALERTS', 'XRAY_PRO'],
    dependencies: [],
    permissions: [
      { id: 'monitoring.view', description: 'View monitoring data' },
      { id: 'monitoring.manage', description: 'Manage incidents and rules', write: true },
    ],
    routes: { backend: '/plugins/monitoring', frontend: '/premium/monitoring' },
    menus: [{ label: 'Monitoring', path: '/premium/monitoring', icon: 'Activity' }],
    scheduler: [
      { id: 'poll-tier-1', queue: 'monitoring', cron: '*/5 * * * * *', requiresWrite: true },
      { id: 'poll-tier-2', queue: 'monitoring', cron: '*/30 * * * * *', requiresWrite: true },
    ],
    requiredApiVersion: '1.0',
    readOnlyCapabilities: {
      read: ['view_metrics', 'view_history', 'view_incidents', 'view_alerts'],
      write: ['collect_metrics', 'run_scheduler', 'ack_incident', 'manage_rules'],
    },
  },
  {
    id: 'backup-center',
    name: 'Backup Center',
    version: '1.0.0',
    description: 'Scheduled backups and disaster recovery.',
    kind: 'PLATFORM',
    phase: 3,
    defaultEnabled: false,
    licenseRequirement: 'platform',
    features: ['REMOTE_BACKUPS'],
    dependencies: [],
    permissions: [
      { id: 'backup.view', description: 'View and download backups' },
      { id: 'backup.manage', description: 'Create and restore backups', write: true },
    ],
    routes: { backend: '/plugins/backup-center', frontend: '/premium/backups' },
    menus: [{ label: 'Backups', path: '/premium/backups', icon: 'DatabaseBackup' }],
    scheduler: [
      { id: 'scheduled-backup', queue: 'platform-jobs', cron: '*/5 * * * *', requiresWrite: true },
    ],
    readOnlyCapabilities: {
      read: ['view_backups', 'download_backup', 'restore_backup', 'delete_backup'],
      write: ['create_backup', 'run_scheduler'],
    },
  },
  {
    id: 'job-center',
    name: 'Job Center',
    version: '1.0.0',
    description: 'Centralized queue for backups, SSL, sync, and platform operations.',
    kind: 'PLATFORM',
    phase: 3,
    defaultEnabled: true,
    licenseRequirement: 'platform',
    features: [],
    dependencies: [],
    permissions: [{ id: 'jobs.view', description: 'View platform jobs' }],
    routes: { backend: '/platform/jobs', frontend: '/premium/jobs' },
    menus: [], // Job Center lives under Premium Settings tabs — hide from sidebar
    scheduler: [],
    readOnlyCapabilities: {
      read: ['view_jobs', 'view_logs'],
      write: ['enqueue_job', 'retry_job'],
    },
  },
];

export function getManifest(moduleId: string): ModuleManifest | undefined {
  return MODULE_MANIFESTS.find((m) => m.id === moduleId);
}

export function getAllFeatureIds(): string[] {
  const set = new Set<string>();
  for (const m of MODULE_MANIFESTS) {
    for (const f of m.features) set.add(f);
  }
  return [...set];
}

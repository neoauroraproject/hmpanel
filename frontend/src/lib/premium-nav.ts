/** Maps premium module ids / paths to Community `nav.*` i18n keys. */
const MODULE_ID_TO_NAV: Record<string, string> = {
  branding: "nav.branding",
  "custom-domains": "nav.customDomains",
  "client-templates": "nav.clientTemplates",
  store: "nav.store",
  "admin-recharge": "nav.adminRecharge",
  "monitoring-pro": "nav.monitoringPro",
  "backup-center": "nav.backupCenter",
  "job-center": "nav.jobCenter",
  "external-panels": "nav.panelPlus",
  themes: "nav.themes",
};

const HREF_TO_NAV: Record<string, string> = {
  "/settings/premium": "nav.premiumSettings",
  "/premium/branding": "nav.branding",
  "/premium/domains": "nav.customDomains",
  "/premium/custom-domains": "nav.customDomains",
  "/premium/client-templates": "nav.clientTemplates",
  "/premium/store": "nav.store",
  "/premium/admin-recharge": "nav.adminRecharge",
  "/premium/monitoring": "nav.monitoringPro",
  "/premium/backups": "nav.backupCenter",
  "/premium/jobs": "nav.jobCenter",
  "/premium/external-panels": "nav.panelPlus",
  "/premium/themes": "nav.themes",
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Resolve a localized premium menu label; falls back to API/registry English name. */
export function translatePremiumMenuTitle(
  t: TFn,
  opts: { moduleId?: string; href?: string; fallback: string },
): string {
  const key =
    (opts.moduleId && MODULE_ID_TO_NAV[opts.moduleId]) ||
    (opts.href && HREF_TO_NAV[opts.href]);
  if (!key) return opts.fallback;
  const translated = t(key);
  return translated === key ? opts.fallback : translated;
}

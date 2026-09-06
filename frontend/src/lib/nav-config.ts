import {
  LayoutDashboard,
  Users,
  UserCog,
  Server,
  Wallet,
  Import,
  Settings,
  Activity,
  Trash2,
  Globe,
  Store,
  DatabaseBackup,
  Palette,
  Layers,
  LayoutTemplate,
} from "lucide-react";
import type { Role } from "@/lib/types";

export type NavIcon = typeof Users;

export interface CoreNavItem {
  href: string;
  icon: NavIcon;
  labelKey: string;
  roles?: Role[];
}

export interface CoreNavSection {
  id: string;
  labelKey: string;
  items: CoreNavItem[];
}

export interface AppNavItem {
  href: string;
  icon: NavIcon;
  labelKey?: string;
  title?: string;
  roles?: Role[];
  isPremium?: boolean;
  moduleId?: string;
}

export interface AppNavSection {
  id: string;
  labelKey: string;
  items: AppNavItem[];
}

export interface PremiumNavInput {
  href: string;
  title: string;
  icon?: NavIcon;
  moduleId?: string;
}

/** Super Admin: dashboard → panels → users → extras → admins → settings last. */
export const CORE_NAV_SECTIONS: CoreNavSection[] = [
  {
    id: "overview",
    labelKey: "nav.sectionOverview",
    items: [{ href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" }],
  },
  {
    id: "infrastructure",
    labelKey: "nav.sectionInfrastructure",
    items: [
      { href: "/panels", icon: Server, labelKey: "nav.panels", roles: ["SUPER_ADMIN"] },
      { href: "/migration", icon: Import, labelKey: "nav.migration", roles: ["SUPER_ADMIN"] },
      { href: "/diagnostics", icon: Activity, labelKey: "nav.diagnostics", roles: ["SUPER_ADMIN"] },
    ],
  },
  {
    id: "users",
    labelKey: "nav.sectionUsers",
    items: [
      { href: "/clients", icon: Users, labelKey: "nav.clients" },
      { href: "/traffic", icon: Wallet, labelKey: "nav.traffic" },
      { href: "/cleanup", icon: Trash2, labelKey: "nav.cleanup", roles: ["SUPER_ADMIN"] },
    ],
  },
  {
    id: "appearance",
    labelKey: "nav.sectionAppearance",
    items: [],
  },
  {
    id: "administration",
    labelKey: "nav.sectionAdministration",
    items: [{ href: "/admins", icon: UserCog, labelKey: "nav.admins", roles: ["SUPER_ADMIN"] }],
  },
  {
    id: "settings",
    labelKey: "nav.sectionSettings",
    items: [{ href: "/settings", icon: Settings, labelKey: "nav.settings", roles: ["SUPER_ADMIN"] }],
  },
];

export const NAV_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  CORE_NAV_SECTIONS.flatMap((section) =>
    section.items.map((item) => [item.href, item.labelKey]),
  ),
);

export function filterCoreNavItems(
  items: CoreNavItem[],
  role: Role | undefined,
): CoreNavItem[] {
  return items.filter((n) => !n.roles || (role && n.roles.includes(role)));
}

export const PREMIUM_NAV_ORDER = [
  "external-panels",
  "monitoring-pro",
  "backup-center",
  "client-templates",
  "store",
  "admin-recharge",
  "branding",
  "themes",
  "custom-domains",
  "job-center",
] as const;

export const PREMIUM_MENU_ICONS: Record<string, NavIcon> = {
  branding: Palette,
  "custom-domains": Globe,
  "client-templates": LayoutTemplate,
  store: Store,
  "admin-recharge": Wallet,
  "monitoring-pro": Activity,
  "backup-center": DatabaseBackup,
  "external-panels": Layers,
  "job-center": Activity,
  themes: Palette,
};

const PREMIUM_SECTION: Record<string, string> = {
  "external-panels": "infrastructure",
  "monitoring-pro": "infrastructure",
  "backup-center": "infrastructure",
  "client-templates": "users",
  store: "users",
  "admin-recharge": "users",
  branding: "appearance",
  themes: "appearance",
  "custom-domains": "appearance",
  "job-center": "settings",
};

const HREF_TO_MODULE: Record<string, string> = {
  "/premium/external-panels": "external-panels",
  "/premium/monitoring": "monitoring-pro",
  "/premium/backups": "backup-center",
  "/premium/client-templates": "client-templates",
  "/premium/store": "store",
  "/premium/admin-recharge": "admin-recharge",
  "/premium/branding": "branding",
  "/premium/themes": "themes",
  "/premium/domains": "custom-domains",
  "/premium/custom-domains": "custom-domains",
  "/premium/jobs": "job-center",
  "/settings/premium": "premium-settings",
};

function resolveModuleId(item: PremiumNavInput): string {
  if (item.moduleId) return item.moduleId;
  return HREF_TO_MODULE[item.href] || "";
}

export function premiumNavRank(moduleId?: string | null, href?: string): number {
  if (href === "/settings/premium") return 1000;
  const id = moduleId || (href === "/premium/themes" ? "themes" : "") || "";
  const idx = PREMIUM_NAV_ORDER.indexOf(id as (typeof PREMIUM_NAV_ORDER)[number]);
  return idx === -1 ? 500 : idx;
}

const INFRA_ORDER = [
  "/panels",
  "/premium/external-panels",
  "/premium/monitoring",
  "/premium/backups",
  "/migration",
  "/diagnostics",
];

const USERS_ORDER_SUPER = [
  "/clients",
  "/traffic",
  "/cleanup",
  "/premium/client-templates",
  "/premium/store",
  "/premium/admin-recharge",
];

const USERS_ORDER_RESELLER = [
  "/clients",
  "/traffic",
  "/premium/client-templates",
  "/premium/store",
  "/premium/admin-recharge",
];

const APPEARANCE_ORDER = ["/premium/branding", "/premium/themes", "/premium/domains", "/premium/custom-domains"];

const SETTINGS_ORDER = ["/settings", "/settings/premium", "/premium/jobs"];

function sortByHref(items: AppNavItem[], order: string[]): AppNavItem[] {
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.href);
    const bi = order.indexOf(b.href);
    return (ai === -1 ? 500 : ai) - (bi === -1 ? 500 : bi);
  });
}

export function buildAppNav(
  role: Role | undefined,
  premiumItems: PremiumNavInput[],
): AppNavSection[] {
  const seen = new Set<string>();
  const sections: AppNavSection[] = CORE_NAV_SECTIONS.map((section) => ({
    id: section.id,
    labelKey: section.labelKey,
    items: filterCoreNavItems(section.items, role).map((item) => {
      seen.add(item.href);
      return { ...item, isPremium: false };
    }),
  }));

  const byId = new Map(sections.map((s) => [s.id, s]));

  for (const raw of premiumItems) {
    if (seen.has(raw.href)) continue;
    seen.add(raw.href);
    const moduleId = resolveModuleId(raw);
    const sectionId =
      raw.href === "/settings/premium" ? "settings" : PREMIUM_SECTION[moduleId] || "users";
    const section = byId.get(sectionId);
    if (!section) continue;
    section.items.push({
      href: raw.href,
      icon: raw.icon || PREMIUM_MENU_ICONS[moduleId] || Store,
      title: raw.title,
      isPremium: true,
      moduleId: moduleId || undefined,
    });
  }

  const usersOrder = role === "RESELLER" ? USERS_ORDER_RESELLER : USERS_ORDER_SUPER;
  const infra = byId.get("infrastructure");
  if (infra) infra.items = sortByHref(infra.items, INFRA_ORDER);
  const users = byId.get("users");
  if (users) users.items = sortByHref(users.items, usersOrder);
  const appearance = byId.get("appearance");
  if (appearance) appearance.items = sortByHref(appearance.items, APPEARANCE_ORDER);
  const settings = byId.get("settings");
  if (settings) settings.items = sortByHref(settings.items, SETTINGS_ORDER);

  return sections.filter((section) => section.items.length > 0);
}

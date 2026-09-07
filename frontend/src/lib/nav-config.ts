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
  Gem,
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
  /** Empty string renders the section without a header. */
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
  /** Empty string renders the section without a header. */
  labelKey: string;
  items: AppNavItem[];
}

export interface PremiumNavInput {
  href: string;
  title: string;
  icon?: NavIcon;
  moduleId?: string;
}

/** Categorized nav: overview (headerless) → management → sales → appearance → tools → settings. */
export const CORE_NAV_SECTIONS: CoreNavSection[] = [
  {
    id: "overview",
    labelKey: "",
    items: [{ href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" }],
  },
  {
    id: "management",
    labelKey: "nav.sectionManagement",
    items: [
      { href: "/admins", icon: UserCog, labelKey: "nav.admins", roles: ["SUPER_ADMIN"] },
      { href: "/clients", icon: Users, labelKey: "nav.clients" },
      { href: "/panels", icon: Server, labelKey: "nav.panels", roles: ["SUPER_ADMIN"] },
    ],
  },
  {
    id: "sales",
    labelKey: "nav.sectionSales",
    items: [{ href: "/traffic", icon: Wallet, labelKey: "nav.traffic" }],
  },
  {
    id: "appearance",
    labelKey: "nav.sectionAppearance",
    items: [],
  },
  {
    id: "tools",
    labelKey: "nav.sectionTools",
    items: [
      { href: "/migration", icon: Import, labelKey: "nav.migration", roles: ["SUPER_ADMIN"] },
      { href: "/cleanup", icon: Trash2, labelKey: "nav.cleanup", roles: ["SUPER_ADMIN"] },
      { href: "/diagnostics", icon: Activity, labelKey: "nav.diagnostics", roles: ["SUPER_ADMIN"] },
    ],
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
  "store",
  "external-panels",
  "client-templates",
  "admin-recharge",
  "branding",
  "themes",
  "custom-domains",
  "backup-center",
  "monitoring-pro",
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
  "premium-settings": Gem,
};

/** Section each premium module joins; unknown modules fall back to tools. */
const PREMIUM_SECTION: Record<string, string> = {
  "external-panels": "management",
  "client-templates": "management",
  store: "sales",
  "admin-recharge": "sales",
  branding: "appearance",
  themes: "appearance",
  "custom-domains": "appearance",
  "monitoring-pro": "tools",
  "backup-center": "tools",
  "job-center": "tools",
  "premium-settings": "settings",
};

const FALLBACK_SECTION = "tools";

const SECTION_HREF_ORDER: Record<string, string[]> = {
  overview: ["/dashboard"],
  management: [
    "/admins",
    "/clients",
    "/panels",
    "/premium/external-panels",
    "/premium/client-templates",
  ],
  sales: ["/premium/store", "/traffic", "/premium/admin-recharge"],
  appearance: [
    "/premium/branding",
    "/premium/themes",
    "/premium/domains",
    "/premium/custom-domains",
  ],
  tools: [
    "/premium/monitoring",
    "/premium/backups",
    "/migration",
    "/cleanup",
    "/premium/jobs",
    "/diagnostics",
  ],
  settings: ["/settings", "/settings/premium"],
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
    const section = byId.get(PREMIUM_SECTION[moduleId] || FALLBACK_SECTION);
    if (!section) continue;
    section.items.push({
      href: raw.href,
      icon: raw.icon || PREMIUM_MENU_ICONS[moduleId] || Store,
      title: raw.title,
      isPremium: true,
      moduleId: moduleId || undefined,
    });
  }

  for (const section of sections) {
    section.items = sortByHref(section.items, SECTION_HREF_ORDER[section.id] || []);
  }

  return sections.filter((section) => section.items.length > 0);
}

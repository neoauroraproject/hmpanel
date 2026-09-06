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
  Diamond,
  DatabaseBackup,
  Palette,
  Layers,
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

/** Domain-grouped Core nav. Premium stays a separate sidebar block. */
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

/** Sort key for the separate Premium block — not mixed into Core. */
export const PREMIUM_NAV_ORDER = [
  "store",
  "admin-recharge",
  "themes",
  "branding",
  "client-templates",
  "custom-domains",
  "monitoring-pro",
  "backup-center",
  "external-panels",
  "job-center",
] as const;

export const PREMIUM_MENU_ICONS: Record<string, NavIcon> = {
  branding: Diamond,
  "custom-domains": Globe,
  "client-templates": Diamond,
  store: Store,
  "admin-recharge": Wallet,
  "monitoring-pro": Activity,
  "backup-center": DatabaseBackup,
  "external-panels": Layers,
  "job-center": Activity,
  themes: Palette,
};

export function premiumNavRank(moduleId?: string | null, href?: string): number {
  if (href === "/settings/premium") return 1000;
  const id =
    moduleId ||
    (href === "/premium/themes" ? "themes" : "") ||
    "";
  const idx = PREMIUM_NAV_ORDER.indexOf(id as (typeof PREMIUM_NAV_ORDER)[number]);
  return idx === -1 ? 500 : idx;
}

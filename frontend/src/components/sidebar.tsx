"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Server,
  Wallet,
  LogOut,
  DatabaseBackup,
  Activity,
  Import,
  Settings,
  Globe,
  Store,
  Diamond,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/store/auth";
import type { Role } from "@/lib/types";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import { translatePremiumMenuTitle } from "@/lib/premium-nav";
import { PanelLogo } from "@/components/PanelLogo";
import { PANEL_BRAND } from "@/lib/panel-brand";
import { useLocale } from "@/i18n";

const CORE_NAV: {
  href: string;
  icon: typeof Users;
  roles?: Role[];
}[] = [
  { href: "/dashboard", icon: LayoutDashboard },
  { href: "/admins", icon: UserCog, roles: ["SUPER_ADMIN"] },
  { href: "/clients", icon: Users },
  { href: "/panels", icon: Server, roles: ["SUPER_ADMIN"] },
  { href: "/migration", icon: Import, roles: ["SUPER_ADMIN"] },
  { href: "/traffic", icon: Wallet },
  { href: "/settings", icon: Settings, roles: ["SUPER_ADMIN"] },
];

const NAV_LABEL_KEYS: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/admins": "nav.admins",
  "/clients": "nav.clients",
  "/panels": "nav.panels",
  "/migration": "nav.migration",
  "/traffic": "nav.traffic",
  "/settings": "nav.settings",
};

const PREMIUM_MENU_ICONS: Record<string, typeof Diamond> = {
  branding: Diamond,
  "custom-domains": Globe,
  "client-templates": Diamond,
  store: Store,
  "admin-recharge": Wallet,
  "monitoring-pro": Activity,
  "backup-center": DatabaseBackup,
};

export function Sidebar() {
  const t = useT();
  const { locale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);
  const { licenseQuery } = useLicenseActivation();
  const dynamicMenus = usePluginRegistry((s) => s.menus);

  const isPremium =
    licenseQuery.data?.edition === "PREMIUM" &&
    licenseQuery.data?.status !== "community" &&
    licenseQuery.data?.mode !== "disabled";

  const { data: premiumModules = [] } = usePremiumModules({ enabled: isPremium });

  const storeModuleEnabled = premiumModules.some(
    (m) => m.id === "store" && m.enabled && m.status !== "disabled" && m.status !== "future",
  );
  const { data: storeDash } = useQuery<{ newOrders?: number }>({
    queryKey: ["store-dashboard"],
    queryFn: async () => (await api.get("/premium-modules/store/dashboard")).data,
    enabled: isPremium && storeModuleEnabled,
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: false,
  });
  const storeHasNewOrders = (storeDash?.newOrders ?? 0) > 0;

  const { data: rechargePending } = useQuery<{ count?: number }>({
    queryKey: ["admin-recharge-pending-count"],
    queryFn: async () =>
      (await api.get("/premium-modules/admin-recharge/pending-count")).data,
    enabled: isPremium && admin?.role === "SUPER_ADMIN",
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: false,
  });
  const rechargePendingCount = rechargePending?.count ?? 0;

  const coreItems = CORE_NAV.filter(
    (n) => !n.roles || (admin && n.roles.includes(admin.role)),
  );

  const premiumMenus = isPremium
    ? [
        ...(admin?.role === "SUPER_ADMIN"
          ? [
              {
                title: t("nav.premiumSettings"),
                href: "/settings/premium",
                icon: Diamond,
                moduleId: undefined as string | undefined,
              },
            ]
          : []),
        ...(admin?.role === "SUPER_ADMIN"
          ? dynamicMenus.map((m) => ({
              title: translatePremiumMenuTitle(t, {
                moduleId: m.moduleId as string | undefined,
                href: m.href,
                fallback: m.title,
              }),
              href: m.href,
              icon: m.icon,
              moduleId: m.moduleId as string | undefined,
            }))
          : []),
        ...premiumModules
          .filter((m) => {
            if (m.status === "disabled" || m.status === "future" || m.id === "job-center") {
              return false;
            }
            if (!m.enabled) return false;
            if (admin?.role === "SUPER_ADMIN") return true;
            return m.kind === "BUSINESS";
          })
          .map((m) => ({
            title: translatePremiumMenuTitle(t, {
              moduleId: m.id,
              href: m.frontendPath,
              fallback: m.name,
            }),
            href: m.frontendPath,
            icon: PREMIUM_MENU_ICONS[m.id] || Diamond,
            moduleId: m.id as string | undefined,
          })),
      ].filter((menu, i, arr) => arr.findIndex((x) => x.href === menu.href) === i)
    : [];

  return (
    <aside className="hidden md:flex w-60 flex-col border-e border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <PanelLogo size={32} />
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">
          {locale === "fa" ? PANEL_BRAND.nameFa : PANEL_BRAND.name}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <nav className="space-y-1 px-3">
          {coreItems.map(({ href, icon: Icon }) => {
            const active = pathname.startsWith(href);
            const label = t(NAV_LABEL_KEYS[href] ?? href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-200",
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        {premiumMenus.length > 0 && (
          <>
            <div className="px-5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">
              {t("app.premium")}
            </div>
            <nav className="space-y-1 px-3 pb-2">
              {premiumMenus.map((menu) => {
                const href = menu.href;
                const title = menu.title;
                const Icon = menu.icon || Diamond;
                const active = pathname.startsWith(href);
                const showDot = menu.moduleId === "store" && storeHasNewOrders;
                const rechargeBadge =
                  menu.moduleId === "admin-recharge" && rechargePendingCount > 0
                    ? rechargePendingCount
                    : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-200",
                    )}
                  >
                    <Icon size={18} />
                    <span className="flex-1 truncate">{title}</span>
                    {rechargeBadge > 0 ? (
                      <>
                        <span
                          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
                          title={t("nav.adminRechargePending", { count: rechargeBadge })}
                        >
                          {rechargeBadge > 99 ? "99+" : rechargeBadge}
                        </span>
                        <span
                          className="absolute end-2 top-2 h-2 w-2 rounded-full bg-rose-500"
                          aria-hidden
                        />
                      </>
                    ) : null}
                    {showDot ? (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-rose-500"
                        title={t("nav.newStoreOrders")}
                        aria-label={t("nav.newStoreOrders")}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 mt-auto">
        <div className="px-2 pb-2">
          <div className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {admin?.username}
          </div>
          <div className="text-xs text-zinc-500">
            {admin?.role === "SUPER_ADMIN" ? t("nav.superAdmin") : t("nav.reseller")}
          </div>
        </div>

        {admin?.role === "SUPER_ADMIN" && (
          <div className="px-2 pb-2">
            <a
              href="https://github.com/neoauroraproject/hmpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              <ExternalLink size={14} /> {t("nav.officialGithub")}
            </a>
          </div>
        )}

        <div className="px-2 pb-2">
          <LocaleSwitcher className="w-full justify-stretch [&>button]:flex-1" />
        </div>
        <div className="px-2 pb-2">
          <ThemeToggle />
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-red-400"
        >
          <LogOut size={18} />
          {t("nav.logout")}
        </button>
      </div>
    </aside>
  );
}

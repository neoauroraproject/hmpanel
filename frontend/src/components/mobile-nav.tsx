"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  LogOut,
  Menu,
  X,
  Diamond,
} from "lucide-react";
import { useAuth } from "@/store/auth";
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
import {
  CORE_NAV_SECTIONS,
  NAV_LABEL_KEYS,
  PREMIUM_MENU_ICONS,
  filterCoreNavItems,
  premiumNavRank,
} from "@/lib/nav-config";

export function MobileNav() {
  const t = useT();
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
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

  const coreSections = CORE_NAV_SECTIONS.map((section) => ({
    ...section,
    items: filterCoreNavItems(section.items, admin?.role),
  })).filter((section) => section.items.length > 0);

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
        ...(admin?.role === "SUPER_ADMIN"
          ? [
              {
                title: t("nav.themes"),
                href: "/premium/themes",
                icon: PREMIUM_MENU_ICONS.themes,
                moduleId: "themes" as string | undefined,
              },
            ]
          : []),
      ]
        .filter((menu, i, arr) => arr.findIndex((x) => x.href === menu.href) === i)
        .sort((a, b) => premiumNavRank(a.moduleId, a.href) - premiumNavRank(b.moduleId, b.href))
    : [];

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        <div className="flex items-center gap-2">
          <PanelLogo size={28} />
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">
            {locale === "fa" ? PANEL_BRAND.nameFa : PANEL_BRAND.name}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="relative rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          aria-label={t("nav.menu")}
        >
          <Menu size={24} />
          {storeHasNewOrders ? (
            <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" aria-hidden />
          ) : null}
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm md:hidden">
          <div className="flex h-full w-64 max-w-sm flex-col bg-white dark:bg-zinc-950">
            <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">{t("nav.menu")}</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                aria-label={t("common.close")}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              {coreSections.map((section) => (
                <div key={section.id} className="mb-2">
                  <div className="px-5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {t(section.labelKey)}
                  </div>
                  <nav className="space-y-1 px-3">
                    {section.items.map(({ href, icon: Icon, labelKey }) => {
                      const active = pathname.startsWith(href);
                      const label = t(labelKey || NAV_LABEL_KEYS[href] || href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setIsOpen(false)}
                          className={clsx(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                              : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900",
                          )}
                        >
                          <Icon size={18} />
                          {label}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              ))}

              {premiumMenus.length > 0 ? (
                <>
                  <div className="px-5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">
                    {t("app.premium")}
                  </div>
                  <nav className="space-y-1 px-3 pb-2">
                    {premiumMenus.map((menu) => {
                      const Icon = menu.icon || Diamond;
                      const active = pathname.startsWith(menu.href);
                      const showDot = menu.moduleId === "store" && storeHasNewOrders;
                      const rechargeBadge =
                        menu.moduleId === "admin-recharge" && rechargePendingCount > 0
                          ? rechargePendingCount
                          : 0;
                      return (
                        <Link
                          key={menu.href}
                          href={menu.href}
                          onClick={() => setIsOpen(false)}
                          className={clsx(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900",
                          )}
                        >
                          <Icon size={18} />
                          <span className="flex-1 truncate">{menu.title}</span>
                          {rechargeBadge > 0 ? (
                            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {rechargeBadge > 99 ? "99+" : rechargeBadge}
                            </span>
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
              ) : null}
            </div>

            <div className="mt-auto border-t border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-3 px-2">
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {admin?.username}
                </div>
                <div className="text-xs text-zinc-500">
                  {admin?.role === "SUPER_ADMIN" ? t("nav.superAdmin") : t("nav.reseller")}
                </div>
              </div>
              <div className="mb-3 px-2">
                <LocaleSwitcher className="w-full justify-stretch [&>button]:flex-1" />
              </div>
              <div className="mb-4 flex items-center justify-between px-2">
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  logout();
                  router.replace("/login");
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                <LogOut size={18} />
                {t("nav.logout")}
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setIsOpen(false)} />
        </div>
      ) : null}
    </>
  );
}

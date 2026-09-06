"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { LogOut, Menu, X, Diamond } from "lucide-react";
import { useAuth } from "@/store/auth";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useT } from "@/i18n";
import { PanelLogo } from "@/components/PanelLogo";
import { PANEL_BRAND } from "@/lib/panel-brand";
import { useLocale } from "@/i18n";
import { NAV_LABEL_KEYS, type AppNavItem } from "@/lib/nav-config";
import { useAppNav } from "@/hooks/useAppNav";

function MobileNavLink({
  item,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
  onNavigate,
}: {
  item: AppNavItem;
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
  onNavigate: () => void;
}) {
  const t = useT();
  const Icon = item.icon;
  const active = pathname.startsWith(item.href);
  const label = item.title || t(item.labelKey || NAV_LABEL_KEYS[item.href] || item.href);
  const showDot = item.moduleId === "store" && storeHasNewOrders;
  const rechargeBadge =
    item.moduleId === "admin-recharge" && rechargePendingCount > 0 ? rechargePendingCount : 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={clsx(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
          : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900",
      )}
    >
      <Icon size={18} />
      <span className="flex-1 truncate">{label}</span>
      {item.isPremium ? (
        <Diamond size={12} className="shrink-0 text-emerald-500" aria-label={t("app.premium")} />
      ) : null}
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
}

export function MobileNav() {
  const t = useT();
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);
  const { sections, storeHasNewOrders, rechargePendingCount } = useAppNav();

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
              {sections.map((section) => (
                <div key={section.id} className="mb-2">
                  {section.items.length > 1 ? (
                    <div className="px-5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      {t(section.labelKey)}
                    </div>
                  ) : null}
                  <nav className="space-y-1 px-3">
                    {section.items.map((item) => (
                      <MobileNavLink
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        storeHasNewOrders={storeHasNewOrders}
                        rechargePendingCount={rechargePendingCount}
                        onNavigate={() => setIsOpen(false)}
                      />
                    ))}
                  </nav>
                </div>
              ))}
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

"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/store/auth";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useT } from "@/i18n";
import { PanelLogo } from "@/components/PanelLogo";
import { PANEL_BRAND } from "@/lib/panel-brand";
import { useLocale } from "@/i18n";
import { useAppNav } from "@/hooks/useAppNav";
import { NavSectionBlock } from "@/components/app-nav";

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
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <PanelLogo size={26} />
          <span className="truncate text-sm font-semibold tracking-tight text-slate-800 dark:text-zinc-100">
            {locale === "fa" ? PANEL_BRAND.nameFa : PANEL_BRAND.name}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-500 outline-none transition-colors duration-200 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-400 dark:hover:bg-zinc-900"
          aria-label={t("nav.openMenu")}
        >
          <Menu size={22} />
          {storeHasNewOrders ? (
            <span className="absolute end-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
          ) : null}
        </button>
      </header>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm md:hidden">
          <div className="flex h-full w-[min(20rem,88vw)] flex-col bg-white dark:bg-zinc-950">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-zinc-800">
              <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{t("nav.menu")}</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-500 outline-none transition-colors duration-200 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-400 dark:hover:bg-zinc-900"
                aria-label={t("nav.closeMenu")}
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t("nav.menu")}>
              {sections.map((section) => (
                <NavSectionBlock
                  key={section.id}
                  section={section}
                  pathname={pathname}
                  storeHasNewOrders={storeHasNewOrders}
                  rechargePendingCount={rechargePendingCount}
                  onNavigate={() => setIsOpen(false)}
                />
              ))}
            </nav>

            <div className="shrink-0 space-y-2.5 border-t border-slate-200 p-3 dark:border-zinc-800">
              <div className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-zinc-900/80">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-zinc-100">
                  {admin?.username}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-500">
                  {admin?.role === "SUPER_ADMIN" ? t("nav.superAdmin") : t("nav.reseller")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <LocaleSwitcher className="min-w-0 flex-1 justify-stretch [&>button]:min-h-11 [&>button]:flex-1" />
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  logout();
                  router.replace("/login");
                }}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[15px] font-medium text-slate-500 outline-none transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
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

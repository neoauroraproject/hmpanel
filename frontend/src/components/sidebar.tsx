"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ChevronDown, LogOut, ExternalLink } from "lucide-react";
import { useAuth } from "@/store/auth";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useT } from "@/i18n";
import { PanelLogo } from "@/components/PanelLogo";
import { PANEL_BRAND } from "@/lib/panel-brand";
import { useLocale } from "@/i18n";
import { NAV_LABEL_KEYS, type AppNavItem, type AppNavSection } from "@/lib/nav-config";
import { useAppNav } from "@/hooks/useAppNav";
import { PremiumGem } from "@/components/PremiumGem";

/** These sections collapse to reduce clutter; others always stay open. */
const COLLAPSIBLE_SECTION_IDS = new Set(["appearance", "tools", "settings"]);

function NavLink({
  item,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
}: {
  item: AppNavItem;
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
}) {
  const t = useT();
  const href = item.href;
  const Icon = item.icon;
  const active = pathname.startsWith(href);
  const label = item.title || t(item.labelKey || NAV_LABEL_KEYS[href] || href);
  const showDot = item.moduleId === "store" && storeHasNewOrders;
  const rechargeBadge =
    item.moduleId === "admin-recharge" && rechargePendingCount > 0 ? rechargePendingCount : 0;

  return (
    <Link
      href={href}
      className={clsx(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[15px] leading-snug transition-colors",
        active
          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-200",
      )}
    >
      <Icon size={17} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {item.isPremium ? (
        <PremiumGem
          size={12}
          className="shrink-0 text-emerald-500"
          title={t("app.premium")}
        />
      ) : null}
      {rechargeBadge > 0 ? (
        <span
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
          title={t("nav.adminRechargePending", { count: rechargeBadge })}
        >
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

function sectionHasActive(section: AppNavSection, pathname: string) {
  return section.items.some((item) => pathname.startsWith(item.href));
}

function NavSection({
  section,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
}: {
  section: AppNavSection;
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
}) {
  const t = useT();
  const collapsible = COLLAPSIBLE_SECTION_IDS.has(section.id);
  const activeInSection = sectionHasActive(section, pathname);
  const [open, setOpen] = useState(() => !collapsible || activeInSection);

  useEffect(() => {
    if (collapsible && activeInSection) setOpen(true);
  }, [collapsible, activeInSection, pathname]);

  const showItems = !collapsible || open;

  return (
    <nav className="space-y-1.5">
      {section.labelKey ? (
        collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 pt-3.5 pb-1.5 text-start text-[11px] font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <span>{t(section.labelKey)}</span>
            <ChevronDown
              size={14}
              className={clsx("shrink-0 transition-transform", open ? "rotate-180" : "")}
            />
          </button>
        ) : (
          <div className="px-2.5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            {t(section.labelKey)}
          </div>
        )
      ) : null}
      {showItems
        ? section.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              storeHasNewOrders={storeHasNewOrders}
              rechargePendingCount={rechargePendingCount}
            />
          ))
        : null}
    </nav>
  );
}

export function Sidebar() {
  const t = useT();
  const { locale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);
  const { sections, storeHasNewOrders, rechargePendingCount } = useAppNav();

  return (
    <aside className="hidden md:flex w-60 flex-col border-e border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
      <div className="flex items-center gap-2 px-3 py-3.5">
        <PanelLogo size={28} />
        <span className="font-semibold text-[14px] text-zinc-800 dark:text-zinc-100">
          {locale === "fa" ? PANEL_BRAND.nameFa : PANEL_BRAND.name}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3">
        {sections.map((section) => (
          <NavSection
            key={section.id}
            section={section}
            pathname={pathname}
            storeHasNewOrders={storeHasNewOrders}
            rechargePendingCount={rechargePendingCount}
          />
        ))}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2 mt-auto">
        <div className="px-2 pb-1.5">
          <div className="truncate text-[14px] font-medium text-zinc-700 dark:text-zinc-200">
            {admin?.username}
          </div>
          <div className="text-[12px] text-zinc-500">
            {admin?.role === "SUPER_ADMIN" ? t("nav.superAdmin") : t("nav.reseller")}
          </div>
        </div>

        {admin?.role === "SUPER_ADMIN" && (
          <div className="px-2 pb-1.5">
            <a
              href="https://github.com/neoauroraproject/hmpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              <ExternalLink size={12} /> {t("nav.officialGithub")}
            </a>
          </div>
        )}

        <div className="px-2 pb-1.5">
          <LocaleSwitcher className="w-full justify-stretch [&>button]:flex-1" />
        </div>
        <div className="px-2 pb-1.5">
          <ThemeToggle />
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-red-400"
        >
          <LogOut size={17} />
          {t("nav.logout")}
        </button>
      </div>
    </aside>
  );
}

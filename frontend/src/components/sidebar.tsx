"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { LogOut, Diamond, ExternalLink } from "lucide-react";
import { useAuth } from "@/store/auth";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useT } from "@/i18n";
import { PanelLogo } from "@/components/PanelLogo";
import { PANEL_BRAND } from "@/lib/panel-brand";
import { useLocale } from "@/i18n";
import { NAV_LABEL_KEYS, type AppNavItem } from "@/lib/nav-config";
import { useAppNav } from "@/hooks/useAppNav";

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
        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-200",
      )}
    >
      <Icon size={18} />
      <span className="flex-1 truncate">{label}</span>
      {item.isPremium ? (
        <Diamond
          size={12}
          className="shrink-0 text-emerald-500"
          aria-label={t("app.premium")}
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
      <div className="flex items-center gap-2.5 px-5 py-5">
        <PanelLogo size={32} />
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">
          {locale === "fa" ? PANEL_BRAND.nameFa : PANEL_BRAND.name}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {sections.map((section) => (
          <div key={section.id} className="mb-2">
            {section.items.length > 1 ? (
              <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
                {t(section.labelKey)}
              </div>
            ) : (
              <div className="pt-2" />
            )}
            <nav className="space-y-1 px-3">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  storeHasNewOrders={storeHasNewOrders}
                  rechargePendingCount={rechargePendingCount}
                />
              ))}
            </nav>
          </div>
        ))}
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

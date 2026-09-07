"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { useT } from "@/i18n";
import { NAV_LABEL_KEYS, type AppNavItem, type AppNavSection } from "@/lib/nav-config";
import { PremiumGem } from "@/components/PremiumGem";

/** Secondary groups collapse; primary routes stay visible. */
export const COLLAPSIBLE_SECTION_IDS = new Set(["appearance", "tools", "settings"]);

function itemLabel(item: AppNavItem, t: (key: string) => string) {
  return item.title || t(item.labelKey || NAV_LABEL_KEYS[item.href] || item.href);
}

export function NavItemLink({
  item,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
  onNavigate,
  compact = false,
}: {
  item: AppNavItem;
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const label = itemLabel(item, t);
  const showDot = item.moduleId === "store" && storeHasNewOrders;
  const rechargeBadge =
    item.moduleId === "admin-recharge" && rechargePendingCount > 0 ? rechargePendingCount : 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group relative flex cursor-pointer items-center gap-2.5 rounded-lg ps-3 pe-2 outline-none transition-colors duration-200",
        "focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950",
        compact ? "min-h-9 text-[13.5px]" : "min-h-11 text-[15px] md:min-h-9 md:text-[13.5px]",
        active
          ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
          : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "absolute start-0 top-1.5 bottom-1.5 w-[3px] rounded-full transition-opacity duration-200",
          active ? "bg-blue-600 opacity-100 dark:bg-blue-400" : "opacity-0",
        )}
      />
      <Icon
        size={16}
        strokeWidth={active ? 2.25 : 1.75}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1 truncate leading-none">{label}</span>
      {item.isPremium ? (
        <PremiumGem
          size={11}
          className="shrink-0 text-emerald-500"
          title={t("app.premium")}
        />
      ) : null}
      {rechargeBadge > 0 ? (
        <span
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
          title={t("nav.adminRechargePending", { count: rechargeBadge })}
        >
          {rechargeBadge > 99 ? "99+" : rechargeBadge}
        </span>
      ) : null}
      {showDot ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"
          title={t("nav.newStoreOrders")}
          aria-label={t("nav.newStoreOrders")}
        />
      ) : null}
    </Link>
  );
}

export function NavSectionBlock({
  section,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
  onNavigate,
  compact = false,
}: {
  section: AppNavSection;
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const collapsible = COLLAPSIBLE_SECTION_IDS.has(section.id);
  const activeInSection = section.items.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const [open, setOpen] = useState(() => !collapsible || activeInSection);

  useEffect(() => {
    if (collapsible && activeInSection) setOpen(true);
  }, [collapsible, activeInSection, pathname]);

  const showItems = !collapsible || open;
  const heading = section.labelKey ? t(section.labelKey) : "";

  return (
    <div className="space-y-1">
      {heading ? (
        collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={clsx(
              "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 text-start outline-none transition-colors duration-200",
              "min-h-8 text-[11px] font-semibold tracking-wide text-slate-500 hover:text-slate-700",
              "focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-500 dark:hover:text-zinc-300",
            )}
          >
            <span>{heading}</span>
            <ChevronDown
              size={14}
              className={clsx(
                "shrink-0 motion-safe:transition-transform motion-safe:duration-200",
                open ? "rotate-180" : "",
              )}
            />
          </button>
        ) : (
          <div className="flex min-h-8 items-center px-2.5 text-[11px] font-semibold tracking-wide text-slate-500 dark:text-zinc-500">
            {heading}
          </div>
        )
      ) : null}
      {showItems ? (
        <div className="space-y-0.5">
          {section.items.map((item) => (
            <NavItemLink
              key={item.href}
              item={item}
              pathname={pathname}
              storeHasNewOrders={storeHasNewOrders}
              rechargePendingCount={rechargePendingCount}
              onNavigate={onNavigate}
              compact={compact}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

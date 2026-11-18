"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { ArrowRight, Gem, Globe, Lock, Send } from "lucide-react";
import { useT } from "@/i18n";
import { NAV_LABEL_KEYS, type AppNavItem, type AppNavSection } from "@/lib/nav-config";

export const PREMIUM_BUY_BOT = "https://t.me/neolicensebot";
export const PREMIUM_BUY_SITE = "https://license.hmray.pro";

/** "/premium/store-digital" → "store-digital"; settings page keeps its own slug. */
function slugOf(item: AppNavItem) {
  if (item.moduleId) return item.moduleId;
  if (item.href === "/settings/premium") return "premium-settings";
  return item.href.split("/").filter(Boolean).pop() || item.href;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TileBody({ item, active, locked, badge }: { item: AppNavItem; active: boolean; locked: boolean; badge: number }) {
  const t = useT();
  const Icon = item.icon;
  const label = item.title || t(item.labelKey || NAV_LABEL_KEYS[item.href] || item.href);
  const descKey = `premiumMenu.desc.${slugOf(item)}`;
  const desc = t(descKey);
  return (
    <>
      <span
        className={clsx(
          "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 transition-colors duration-150",
          locked
            ? "bg-zinc-500/[0.08] text-zinc-400 ring-zinc-500/15 dark:text-zinc-500"
            : "bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-600 ring-amber-500/25 group-hover:from-amber-400/30 dark:text-amber-300",
        )}
      >
        <Icon size={18} strokeWidth={1.9} aria-hidden />
        {locked ? (
          <span className="absolute -bottom-1 -end-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--hm-surface)] text-zinc-400 ring-1 ring-zinc-500/20">
            <Lock size={9} strokeWidth={2.5} aria-hidden />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="flex items-center gap-1.5">
          <span
            className={clsx(
              "truncate text-[13.5px] font-semibold leading-5",
              locked ? "text-zinc-500 dark:text-zinc-400" : active ? "text-amber-700 dark:text-amber-300" : "text-zinc-900 dark:text-zinc-50",
            )}
          >
            {label}
          </span>
          {badge > 0 ? (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-zinc-950">
              {badge}
            </span>
          ) : null}
        </span>
        {desc && desc !== descKey ? (
          <span className={clsx("mt-0.5 line-clamp-2 block text-[11.5px] leading-[1.45]", locked ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-500 dark:text-zinc-400")}>
            {desc}
          </span>
        ) : null}
      </span>
    </>
  );
}

function Tile({
  item,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
  onNavigate,
  locked,
}: {
  item: AppNavItem;
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
  onNavigate: () => void;
  locked: boolean;
}) {
  const t = useT();
  const active = !locked && isActive(pathname, item.href);
  const badge = !locked && item.moduleId === "admin-recharge" && rechargePendingCount > 0 ? rechargePendingCount : 0;
  const dot = !locked && item.moduleId === "store" && storeHasNewOrders;
  const base = "group relative flex items-start gap-3 rounded-2xl p-2.5 outline-none transition-colors duration-150";

  if (locked) {
    return (
      <div role="menuitem" aria-disabled="true" title={t("premiumMenu.lockedTip")} className={clsx(base, "cursor-not-allowed select-none")}>
        <TileBody item={item} active={false} locked badge={0} />
      </div>
    );
  }
  return (
    <Link
      href={item.href}
      role="menuitem"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={clsx(
        base,
        "focus-visible:ring-2 focus-visible:ring-amber-400/70",
        active ? "bg-amber-500/[0.08]" : "hover:bg-zinc-900/[0.035] dark:hover:bg-white/[0.05]",
      )}
    >
      <TileBody item={item} active={active} locked={false} badge={badge} />
      {dot ? <span className="absolute start-2 top-2 h-2 w-2 rounded-full bg-rose-500" aria-hidden /> : null}
    </Link>
  );
}

/**
 * Mega menu behind the Premium button. Licensed: every module as a tile with a
 * one-line description. Not licensed: the same tiles, locked, plus ways to buy.
 */
export function PremiumMegaMenu({
  groups,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
  onNavigate,
  locked = false,
  onPointerEnter,
  onPointerLeave,
}: {
  groups: AppNavSection[];
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
  onNavigate: () => void;
  locked?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const t = useT();
  const settings = groups.flatMap((g) => g.items).find((i) => i.href === "/settings/premium");
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.href !== "/settings/premium") }))
    .filter((g) => g.items.length > 0);
  const count = shown.reduce((n, g) => n + g.items.length, 0);

  return (
    <div
      role="menu"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="hm-pop absolute inset-x-0 top-full z-50 mx-auto mt-3 w-[min(46rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] border border-amber-500/20 bg-[var(--hm-surface)] shadow-[0_30px_80px_-28px_rgb(0_0_0/0.55)]"
    >
      <div className="relative overflow-hidden bg-zinc-950 px-5 py-4 text-white">
        <div className="pointer-events-none absolute -top-24 start-1/3 h-48 w-80 rounded-full bg-amber-500/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 text-zinc-950 shadow-[0_8px_24px_-8px_rgb(245_158_11/0.8)]">
            <Gem size={20} strokeWidth={2.2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="bg-gradient-to-l from-amber-200 via-amber-300 to-amber-500 bg-clip-text text-[15px] font-bold text-transparent">
                {t("premiumMenu.title")}
              </span>
              <span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-200/90">
                {locked ? t("premiumMenu.lockedBadge") : t("premiumMenu.count", { count })}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[12px] text-zinc-400">
              {locked ? t("premiumMenu.lockedSubtitle") : t("premiumMenu.subtitle")}
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[min(58dvh,32rem)] overflow-y-auto p-3">
        <div className="gap-x-2 sm:columns-2">
          {shown.map((g) => (
            <section key={g.id} className="mb-3 break-inside-avoid last:mb-0">
              {g.labelKey ? (
                <h3 className="flex items-center gap-2 px-2.5 pb-1 pt-1 text-[11px] font-bold tracking-wide text-zinc-400 dark:text-zinc-500">
                  <span className="h-px w-3 bg-amber-500/60" aria-hidden />
                  {t(g.labelKey)}
                </h3>
              ) : null}
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <Tile
                    key={item.href}
                    item={item}
                    locked={locked}
                    pathname={pathname}
                    storeHasNewOrders={storeHasNewOrders}
                    rechargePendingCount={rechargePendingCount}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {locked ? (
        <div className="border-t border-amber-500/20 bg-gradient-to-l from-amber-500/[0.08] to-transparent px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="me-auto min-w-[12rem]">
              <div className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-50">{t("premiumMenu.buyTitle")}</div>
              <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400">{t("premiumMenu.buyHint")}</div>
            </div>
            <a
              href={PREMIUM_BUY_BOT}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-300 px-4 text-[13px] font-semibold text-zinc-800 outline-none transition-colors hover:border-amber-400 hover:text-amber-700 focus-visible:ring-2 focus-visible:ring-amber-400/70 dark:border-zinc-700 dark:text-zinc-100 dark:hover:text-amber-300"
            >
              <Send size={15} aria-hidden /> {t("premiumMenu.buyBot")}
            </a>
            <a
              href={PREMIUM_BUY_SITE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 px-5 text-[13px] font-bold text-zinc-950 shadow-[0_8px_22px_-8px_rgb(245_158_11/0.9)] outline-none transition-[filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <Globe size={15} aria-hidden /> {t("premiumMenu.buySite")}
            </a>
          </div>
        </div>
      ) : settings ? (
        <Link
          href={settings.href}
          role="menuitem"
          onClick={onNavigate}
          className="group flex items-center gap-2 border-t border-[var(--hm-line)] px-5 py-3 text-[12.5px] font-semibold text-zinc-600 outline-none transition-colors hover:bg-amber-500/[0.06] hover:text-amber-700 focus-visible:bg-amber-500/[0.06] dark:text-zinc-300 dark:hover:text-amber-300"
        >
          <Gem size={14} className="text-amber-500" aria-hidden />
          <span className="flex-1">{t("premiumMenu.settings")}</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

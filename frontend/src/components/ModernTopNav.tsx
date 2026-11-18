"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ChevronDown, ExternalLink, Gem, Lock, LogOut, PanelTop } from "lucide-react";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";
import { PanelBrandName, PanelLogo } from "@/components/PanelLogo";
import { useAppNav } from "@/hooks/useAppNav";
import { useAppBrand } from "@/hooks/useAppBrand";
import { NavItemLink, NavSectionBlock } from "@/components/app-nav";
import {
  DEFAULT_PINS_COMMUNITY,
  DEFAULT_PINS_PREMIUM,
  NAV_LABEL_KEYS,
  type AppNavItem,
  type AppNavSection,
} from "@/lib/nav-config";
import { useNavPins } from "@/store/navPins";
import { NavPinsDialog } from "@/components/NavPinsDialog";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppearanceControls } from "@/components/AppearanceMenu";
import { PremiumMegaMenu } from "@/components/PremiumMegaMenu";

/* Pinned pages sit directly in the bar; the user picks them (NavPinsDialog).
   Defaults: DEFAULT_PINS_COMMUNITY / DEFAULT_PINS_PREMIUM in nav-config. */

const PILL_BAR =
  "border border-[var(--hm-line)] bg-[var(--hm-surface-soft)] shadow-[var(--hm-shadow-float)] backdrop-blur-xl";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function PillLink({ item, pathname }: { item: AppNavItem; pathname: string }) {
  const t = useT();
  const Icon = item.icon;
  const active = isActive(pathname, item.href);
  const label = item.title || t(item.labelKey || NAV_LABEL_KEYS[item.href] || item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={label}
      className={clsx(
        "flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-[13.5px] transition-colors duration-150",
        FOCUS,
        active
          ? "hm-ink font-semibold"
          : "font-medium text-zinc-600 hover:bg-zinc-900/[0.06] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-50",
      )}
    >
      <Icon
        size={16}
        strokeWidth={active ? 2.2 : 1.8}
        className={clsx("shrink-0", item.isPremium && !active && "text-amber-500")}
        aria-hidden
      />
      <span className={clsx("whitespace-nowrap leading-none", !active && "hidden xl:inline")}>{label}</span>
    </Link>
  );
}

function SectionMenu({
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
  // Open state is tied to the route it was opened on, so navigating closes the menu.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) =>
    setOpenAt((typeof next === "function" ? next(open) : next) ? pathname : null);
  const ref = useDismiss(open, () => setOpenAt(null));
  const active = section.items.some((item) => isActive(pathname, item.href));
  const hasDot =
    (storeHasNewOrders && section.items.some((i) => i.moduleId === "store")) ||
    (rechargePendingCount > 0 && section.items.some((i) => i.moduleId === "admin-recharge"));

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx(
          "relative flex h-9 cursor-pointer items-center gap-1.5 rounded-full ps-3.5 pe-2.5 text-[13.5px] transition-colors duration-150",
          FOCUS,
          active
            ? "hm-ink font-semibold"
            : "font-medium text-zinc-600 hover:bg-zinc-900/[0.06] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-50",
        )}
      >
        <span className="whitespace-nowrap leading-none">{t(section.labelKey)}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={clsx("motion-safe:transition-transform motion-safe:duration-200", open && "rotate-180")}
        />
        {hasDot ? (
          <span className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
        ) : null}
      </button>
      {open ? (
        <div
          role="menu"
          className="hm-pop absolute start-0 top-full z-50 mt-2.5 w-64 space-y-0.5 rounded-3xl border border-[var(--hm-line)] bg-[var(--hm-surface)] p-2 shadow-[0_24px_60px_-24px_rgb(20_28_50/0.45)]"
        >
          {section.items.map((item) => (
            <NavItemLink
              key={item.href}
              item={item}
              pathname={pathname}
              storeHasNewOrders={storeHasNewOrders}
              rechargePendingCount={rechargePendingCount}
              onNavigate={() => setOpen(false)}
              compact
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Premium gets its own gold button that never folds into "More", so it is always
 * one click away and clearly set apart from the free pages.
 */
function PremiumMenu({
  groups,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
  locked = false,
}: {
  groups: AppNavSection[];
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
  locked?: boolean;
}) {
  const t = useT();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const ref = useDismiss(open, () => setOpenAt(null));
  const closeTimer = useRef<number | null>(null);
  const active = !locked && groups.some((g) => g.items.some((item) => isActive(pathname, item.href)));
  const hasDot =
    !locked &&
    ((storeHasNewOrders && groups.some((g) => g.items.some((i) => i.moduleId === "store"))) ||
      (rechargePendingCount > 0 && groups.some((g) => g.items.some((i) => i.moduleId === "admin-recharge"))));

  // Hover opens the menu on mouse devices; a short delay lets the pointer cross the gap.
  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const hoverOpen = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancelClose();
    setOpenAt(pathname);
  };
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenAt(null), 220);
  };
  useEffect(() => cancelClose, []);

  return (
    // Deliberately not `relative`: the mega menu centres under the header, not this button.
    <div ref={ref} className="shrink-0" onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
      <button
        type="button"
        onClick={() => setOpenAt(open ? null : pathname)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx(
          "relative flex h-9 cursor-pointer items-center gap-1.5 rounded-full ps-3 pe-2.5 text-[13.5px] font-semibold transition-[box-shadow] duration-150",
          "bg-gradient-to-b from-zinc-800 to-zinc-950 ring-1 ring-amber-400/45 shadow-[0_6px_18px_-8px_rgb(245_158_11/0.65)] hover:ring-amber-300/80 dark:to-black",
          active && "ring-2 ring-amber-300",
          "outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        )}
      >
        {locked ? <Lock size={13} strokeWidth={2.4} className="text-amber-300/80" aria-hidden /> : null}
        <Gem size={15} strokeWidth={2.2} className="text-amber-300" aria-hidden />
        <span className="whitespace-nowrap bg-gradient-to-l from-amber-100 to-amber-300 bg-clip-text leading-none text-transparent">
          {t("app.premium")}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={clsx("text-amber-300/80 motion-safe:transition-transform motion-safe:duration-200", open && "rotate-180")}
        />
        {hasDot ? (
          <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500 dark:border-zinc-900" aria-hidden />
        ) : null}
      </button>
      {open ? (
        <PremiumMegaMenu
          groups={groups}
          locked={locked}
          pathname={pathname}
          storeHasNewOrders={storeHasNewOrders}
          rechargePendingCount={rechargePendingCount}
          onNavigate={() => setOpenAt(null)}
        />
      ) : null}
    </div>
  );
}

/** Narrow screens: every section folds into one menu so the bar never overflows. */
function MoreMenu({
  sections,
  pathname,
  storeHasNewOrders,
  rechargePendingCount,
}: {
  sections: AppNavSection[];
  pathname: string;
  storeHasNewOrders: boolean;
  rechargePendingCount: number;
}) {
  const t = useT();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const ref = useDismiss(open, () => setOpenAt(null));
  const active = sections.some((s) => s.items.some((item) => isActive(pathname, item.href)));
  const hasDot = storeHasNewOrders || rechargePendingCount > 0;

  return (
    <div ref={ref} className="relative shrink-0 2xl:hidden">
      <button
        type="button"
        onClick={() => setOpenAt(open ? null : pathname)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx(
          "relative flex h-9 cursor-pointer items-center gap-1.5 rounded-full ps-3.5 pe-2.5 text-[13.5px] transition-colors duration-150",
          FOCUS,
          active
            ? "hm-ink font-semibold"
            : "font-medium text-zinc-600 hover:bg-zinc-900/[0.06] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-50",
        )}
      >
        <span className="whitespace-nowrap leading-none">{t("appearance.more")}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={clsx("motion-safe:transition-transform motion-safe:duration-200", open && "rotate-180")}
        />
        {hasDot ? (
          <span className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
        ) : null}
      </button>
      {open ? (
        <div
          role="menu"
          className="hm-pop absolute end-0 top-full z-50 mt-2.5 max-h-[70dvh] w-72 space-y-3 overflow-y-auto rounded-3xl border border-[var(--hm-line)] bg-[var(--hm-surface)] p-2.5 shadow-[0_24px_60px_-24px_rgb(20_28_50/0.45)]"
        >
          {sections.map((section) => (
            <NavSectionBlock
              key={section.id}
              section={section}
              pathname={pathname}
              storeHasNewOrders={storeHasNewOrders}
              rechargePendingCount={rechargePendingCount}
              onNavigate={() => setOpenAt(null)}
              compact
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu({ onCustomize }: { onCustomize: () => void }) {
  const t = useT();
  const router = useRouter();
  const { brand } = useAppBrand();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const initial = (admin?.username || "?").slice(0, 1).toUpperCase();
  const roleLabel = admin?.role === "SUPER_ADMIN" ? t("nav.superAdmin") : t("nav.reseller");

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("appearance.account")}
        className={clsx(
          "flex h-11 cursor-pointer items-center gap-2.5 rounded-full ps-1.5 pe-3.5 transition-colors duration-150",
          PILL_BAR,
          FOCUS,
        )}
      >
        <span className="hm-ink flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold">
          {initial}
        </span>
        <span className="hidden max-w-28 truncate text-[13px] font-medium text-zinc-800 lg:inline dark:text-zinc-100">
          {admin?.username}
        </span>
        <ChevronDown size={14} className="text-zinc-500" aria-hidden />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t("appearance.account")}
          className="hm-pop absolute end-0 top-full z-50 mt-2.5 w-72 rounded-3xl border border-[var(--hm-line)] bg-[var(--hm-surface)] p-4 shadow-[0_24px_60px_-24px_rgb(20_28_50/0.45)]"
        >
          <div className="flex items-center gap-3">
            <span className="hm-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              {initial}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{admin?.username}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{roleLabel}</div>
            </div>
          </div>

          <div className="my-4 h-px bg-[var(--hm-line)]" />

          <div className="mb-3 text-xs font-semibold text-zinc-900 dark:text-zinc-100">{t("appearance.title")}</div>
          <AppearanceControls />
          <div className="mt-3">
            <div className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{t("nav.language")}</div>
            <LocaleSwitcher className="w-full rounded-full [&>button]:min-h-8 [&>button]:flex-1 [&>button]:rounded-full" />
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCustomize();
            }}
            className={clsx(
              "mt-3 flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-full border border-[var(--hm-line)] px-3 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-900/[0.05] dark:text-zinc-200 dark:hover:bg-white/[0.06]",
              FOCUS,
            )}
          >
            <PanelTop size={15} aria-hidden /> {t("navPins.open")}
          </button>

          <div className="my-4 h-px bg-[var(--hm-line)]" />

          {admin?.role === "SUPER_ADMIN" || (brand.custom && brand.showGithub) ? (
            <Link
              href="https://github.com/neoauroraproject/hmpanel"
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                "flex min-h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-900/[0.06] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-50",
                FOCUS,
              )}
            >
              <ExternalLink size={15} aria-hidden /> {t("nav.officialGithub")}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-full px-3 text-[13px] font-medium text-zinc-600 outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-400/60 dark:text-zinc-400 dark:hover:text-rose-400"
          >
            <LogOut size={15} aria-hidden /> {t("nav.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ModernTopNav() {
  const t = useT();
  const pathname = usePathname();
  const { sections, storeHasNewOrders, rechargePendingCount, isPremium, premiumTeaser } = useAppNav();
  const userPins = useNavPins((s) => s.pins);
  const hydratePins = useNavPins((s) => s.hydrate);
  const [customizing, setCustomizing] = useState(false);
  useEffect(() => hydratePins(), [hydratePins]);
  const defaultPins = isPremium ? DEFAULT_PINS_PREMIUM : DEFAULT_PINS_COMMUNITY;

  const { pinned, menus, premium } = useMemo(() => {
    const all = sections.flatMap((s) => s.items);
    // Pins to pages this admin cannot open (role, license) are skipped, not shown broken.
    const pinnedItems = (userPins ?? defaultPins)
      .map((href) => all.find((i) => i.href === href))
      .filter((i): i is AppNavItem => !!i);
    const pinnedSet = new Set(pinnedItems.map((i) => i.href));
    const isPrem = (i: AppNavItem) => !!i.isPremium || i.href.startsWith("/premium/");
    // The Premium menu always lists every Premium page, pinned or not.
    const premiumGroups = sections
      .map((s) => ({ ...s, items: s.items.filter((i) => isPrem(i)) }))
      .filter((s) => s.items.length > 0);
    const rest = sections
      .map((s) => ({ ...s, items: s.items.filter((i) => !pinnedSet.has(i.href) && !isPrem(i)) }))
      .filter((s) => s.items.length > 0 && s.labelKey);
    return { pinned: pinnedItems, menus: rest, premium: premiumGroups };
  }, [sections, userPins, defaultPins]);
  const lockedPremium = !isPremium && premiumTeaser.length > 0;

  return (
    <header className="relative z-40 hidden shrink-0 items-center gap-3 px-5 pt-4 md:flex lg:px-8">
      <Link
        href="/dashboard"
        className={clsx("flex h-11 shrink-0 items-center gap-2.5 rounded-full ps-2.5 pe-4", PILL_BAR, FOCUS)}
      >
        <PanelLogo size={26} />
        <PanelBrandName className="hidden max-w-40 truncate text-sm font-semibold tracking-tight text-zinc-900 lg:inline dark:text-zinc-50" />
      </Link>

      <nav
        aria-label={t("nav.menu")}
        className={clsx("mx-auto flex min-w-0 items-center gap-0.5 rounded-full p-1", PILL_BAR)}
      >
        {pinned.map((item) => (
          <PillLink key={item.href} item={item} pathname={pathname} />
        ))}
        {(menus.length > 0 || premium.length > 0 || lockedPremium) && pinned.length > 0 ? (
          <span className="mx-1 h-5 w-px shrink-0 bg-[var(--hm-line)]" aria-hidden />
        ) : null}
        {premium.length > 0 ? (
          <PremiumMenu
            groups={premium}
            pathname={pathname}
            storeHasNewOrders={storeHasNewOrders}
            rechargePendingCount={rechargePendingCount}
          />
        ) : lockedPremium ? (
          <PremiumMenu groups={premiumTeaser} locked pathname={pathname} storeHasNewOrders={false} rechargePendingCount={0} />
        ) : null}
        <div className="hidden items-center gap-0.5 2xl:flex">
          {menus.map((section) =>
            section.items.length === 1 ? (
              <PillLink key={section.id} item={section.items[0]} pathname={pathname} />
            ) : (
              <SectionMenu
                key={section.id}
                section={section}
                pathname={pathname}
                storeHasNewOrders={storeHasNewOrders}
                rechargePendingCount={rechargePendingCount}
              />
            ),
          )}
        </div>
        {menus.length > 0 ? (
          <MoreMenu
            sections={menus}
            pathname={pathname}
            storeHasNewOrders={storeHasNewOrders}
            rechargePendingCount={rechargePendingCount}
          />
        ) : null}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <div className={clsx("flex h-11 w-11 items-center justify-center rounded-full [&>button]:rounded-full [&>button]:bg-transparent dark:[&>button]:bg-transparent", PILL_BAR)}>
          <ThemeToggle />
        </div>
        <AccountMenu onCustomize={() => setCustomizing(true)} />
      </div>
      {customizing ? (
        <NavPinsDialog
          sections={sections}
          pins={pinned.map((i) => i.href)}
          defaultPins={defaultPins}
          onClose={() => setCustomizing(false)}
        />
      ) : null}
    </header>
  );
}

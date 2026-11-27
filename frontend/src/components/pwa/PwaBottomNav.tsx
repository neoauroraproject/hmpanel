"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Menu,
  Store,
  UserCog,
  Users,
  Wallet,
  Activity,
} from "lucide-react";
import { useT } from "@/i18n";
import { useAppNav } from "@/hooks/useAppNav";
import { useIsStandalone } from "@/hooks/useIsStandalone";
import { useMobileNavDrawer } from "@/store/mobileNav";
import type { NavIcon } from "@/lib/nav-config";

type Tab = { href: string; icon: NavIcon; labelKey: string };

/** Preferred order; the first four that exist in the role's nav become tabs. */
const TAB_CANDIDATES: Tab[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "pwa.tabDashboard" },
  { href: "/clients", icon: Users, labelKey: "pwa.tabClients" },
  { href: "/admins", icon: UserCog, labelKey: "pwa.tabAdmins" },
  { href: "/premium/admin-recharge", icon: Wallet, labelKey: "pwa.tabRecharge" },
  { href: "/premium/store", icon: Store, labelKey: "pwa.tabStore" },
  { href: "/traffic", icon: Activity, labelKey: "pwa.tabTraffic" },
];

const MAX_TABS = 4;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PwaBottomNav() {
  const t = useT();
  const pathname = usePathname();
  const standalone = useIsStandalone();
  const { sections, storeHasNewOrders, rechargePendingCount } = useAppNav();
  const drawerOpen = useMobileNavDrawer((s) => s.open);
  const openDrawer = useMobileNavDrawer((s) => s.setOpen);

  const tabs = useMemo(() => {
    const available = new Set(sections.flatMap((s) => s.items.map((i) => i.href)));
    return TAB_CANDIDATES.filter((tab) => available.has(tab.href)).slice(0, MAX_TABS);
  }, [sections]);

  // Publish the bar's real height as --hm-bottom-nav so floating bars (bulk actions,
  // sticky checkout) sit above it instead of underneath. 0 when the bar is not shown.
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = navRef.current;
    if (!standalone || !el) {
      root.style.setProperty("--hm-bottom-nav", "0px");
      return;
    }
    const update = () => {
      const visible = window.getComputedStyle(el).display !== "none";
      root.style.setProperty("--hm-bottom-nav", visible ? `${Math.ceil(el.getBoundingClientRect().height)}px` : "0px");
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      root.style.setProperty("--hm-bottom-nav", "0px");
    };
  }, [standalone]);

  if (!standalone) return null;

  const menuActive = drawerOpen || !tabs.some((tab) => isActive(pathname, tab.href));

  return (
    <nav
      ref={navRef}
      aria-label={t("pwa.bottomNav")}
      className="pwa-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 md:hidden"
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-stretch justify-between gap-1 rounded-[22px] border border-slate-200/70 bg-white/85 p-1.5 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-zinc-900/80 dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const badge =
            tab.href === "/premium/admin-recharge"
              ? rechargePendingCount
              : tab.href === "/premium/store" && storeHasNewOrders
                ? -1
                : 0;
          return (
            <TabButton
              key={tab.href}
              href={tab.href}
              icon={tab.icon}
              label={t(tab.labelKey)}
              active={active}
              badge={badge}
            />
          );
        })}
        <TabButton
          icon={Menu}
          label={t("pwa.tabMenu")}
          active={menuActive}
          onClick={() => openDrawer(true)}
        />
      </div>
    </nav>
  );
}

function TabButton({
  href,
  icon: Icon,
  label,
  active,
  badge = 0,
  onClick,
}: {
  href?: string;
  icon: NavIcon;
  label: string;
  active: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className={clsx(
          "relative flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
          active
            ? "bg-blue-600/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300"
            : "text-slate-500 dark:text-zinc-400",
        )}
      >
        <Icon size={20} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
        {badge !== 0 ? (
          <span
            className={clsx(
              "absolute -top-0.5 end-1.5 flex items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-900",
              badge > 0 ? "h-4 min-w-4 px-1" : "h-2 w-2",
            )}
            aria-hidden
          >
            {badge > 0 ? (badge > 9 ? "9+" : badge) : null}
          </span>
        ) : null}
      </span>
      <span
        className={clsx(
          "max-w-full truncate text-[10.5px] leading-none transition-colors duration-200",
          active ? "font-semibold text-slate-900 dark:text-zinc-50" : "font-medium text-slate-500 dark:text-zinc-400",
        )}
      >
        {label}
      </span>
    </>
  );

  const className =
    "flex min-h-[52px] min-w-0 flex-1 cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-2xl outline-none transition-transform duration-150 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-blue-500/50 motion-reduce:transition-none motion-reduce:active:scale-100";

  if (href) {
    return (
      <Link href={href} className={className} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} aria-haspopup="dialog">
      {body}
    </button>
  );
}

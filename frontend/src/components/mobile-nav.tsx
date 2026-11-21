"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/store/auth";
import { ThemeToggle } from "./ThemeToggle";
import { AppearanceButton } from "./AppearanceMenu";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useT } from "@/i18n";
import { PanelBrandName, PanelLogo } from "@/components/PanelLogo";
import { useAppNav } from "@/hooks/useAppNav";
import { NavSectionBlock } from "@/components/app-nav";
import { TopUpNavButton } from "@/components/TopUpNavButton";
import { useMobileNavDrawer } from "@/store/mobileNav";

const CLOSE_MS = 280;
const SWIPE_CLOSE_RATIO = 0.3;
const SWIPE_CLOSE_VELOCITY = 0.45;

type DragState = { x: number; y: number; t: number; offset: number; axis: "x" | "y" | null; rtl: boolean };

export function MobileNav() {
  const t = useT();
  const isOpen = useMobileNavDrawer((s) => s.open);
  const setIsOpen = useMobileNavDrawer((s) => s.setOpen);
  const pathname = usePathname();
  const [mounted, setMounted] = useState(isOpen);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setDragStyles(0, false, true);
      // Two frames so the closed transform is painted before transitioning to open.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (shown) closeRef.current?.focus({ preventScroll: true });
  }, [shown]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, setIsOpen]);

  const setDragStyles = (offset: number, rtl: boolean, animate: boolean) => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !backdrop) return;
    const width = panel.offsetWidth || 1;
    panel.style.transition = animate ? "" : "none";
    backdrop.style.transition = animate ? "" : "none";
    panel.style.transform = offset ? `translateX(${rtl ? offset : -offset}px)` : "";
    backdrop.style.opacity = offset ? String(Math.max(0, 1 - offset / width)) : "";
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    drag.current = {
      x: touch.clientX,
      y: touch.clientY,
      t: performance.now(),
      offset: 0,
      axis: null,
      rtl: getComputedStyle(e.currentTarget).direction === "rtl",
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const touch = e.touches[0];
    const dx = touch.clientX - d.x;
    const dy = touch.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (d.axis !== "x") return;
    d.offset = Math.max(0, d.rtl ? dx : -dx);
    setDragStyles(d.offset, d.rtl, false);
  };

  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x" || !d.offset) return;
    const width = panelRef.current?.offsetWidth || 1;
    const velocity = d.offset / Math.max(1, performance.now() - d.t);
    if (d.offset > width * SWIPE_CLOSE_RATIO || velocity > SWIPE_CLOSE_VELOCITY) {
      setDragStyles(width, d.rtl, true);
      setIsOpen(false);
    } else {
      setDragStyles(0, d.rtl, true);
    }
  };
  const router = useRouter();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);
  const { menuSections: sections, showTopUp, storeHasNewOrders, rechargePendingCount } = useAppNav();

  return (
    <>
      <header className="hm-mobile-header pwa-safe-top flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <PanelLogo size={26} />
          <PanelBrandName className="truncate text-sm font-semibold tracking-tight text-slate-800 dark:text-zinc-100" />
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

      {mounted ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <div
            ref={backdropRef}
            className={clsx(
              "absolute inset-0 bg-black/45 transition-opacity motion-reduce:transition-none",
              shown ? "opacity-100 duration-[380ms] ease-out" : "opacity-0 duration-[260ms] ease-in",
            )}
            onClick={() => setIsOpen(false)}
            aria-hidden
          />
          <div
            ref={panelRef}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            className={clsx(
              "pwa-safe-y absolute inset-y-0 start-0 flex w-[min(20rem,88vw)] touch-pan-y flex-col bg-white shadow-[0_0_40px_-8px_rgba(15,23,42,0.35)] will-change-transform transition-transform motion-reduce:transition-none dark:bg-zinc-950 dark:shadow-[0_0_40px_-8px_rgba(0,0,0,0.9)]",
              shown
                ? "translate-x-0 duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
                : "-translate-x-full duration-[280ms] ease-[cubic-bezier(0.4,0,1,1)] rtl:translate-x-full",
            )}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-zinc-800">
              <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{t("nav.menu")}</span>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-500 outline-none transition-colors duration-200 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-400 dark:hover:bg-zinc-900"
                aria-label={t("nav.closeMenu")}
              >
                <X size={20} />
              </button>
            </div>

            <nav
              className={clsx(
                "flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-4 transition-[opacity,transform] motion-reduce:transition-none",
                shown
                  ? "translate-y-0 opacity-100 delay-75 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                  : "translate-y-2 opacity-0 duration-150",
              )}
              aria-label={t("nav.menu")}
            >
              {showTopUp ? (
                <TopUpNavButton variant="block" pending={rechargePendingCount} onNavigate={() => setIsOpen(false)} />
              ) : null}
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
                <AppearanceButton />
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
        </div>
      ) : null}
    </>
  );
}

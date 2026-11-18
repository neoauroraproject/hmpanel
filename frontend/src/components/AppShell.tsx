"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { subscribeAuthHydration, useAuth } from "@/store/auth";
import type { SessionAdmin } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Toaster } from "@/components/toast";
import { TimezoneBootstrap } from "@/components/TimezoneBootstrap";
import { PanelBootSplash } from "@/components/PanelLogo";
import { clsx } from "clsx";
import { useT } from "@/i18n";
import { PwaBottomNav } from "@/components/pwa/PwaBottomNav";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { UiStyleScope } from "@/components/UiStyleScope";
import { ModernTopNav } from "@/components/ModernTopNav";
import { useUiStyle } from "@/store/uiStyle";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const setAdmin = useAuth((s) => s.setAdmin);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const [isHydrated, setIsHydrated] = useState(false);
  const t = useT();
  const { modern, nav } = useUiStyle();
  const topNav = modern && nav === "top";

  useEffect(() => subscribeAuthHydration(() => setIsHydrated(true)), []);

  useEffect(() => {
    if (!isHydrated) return;

    if (!token) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [token, router, pathname, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !token) return;
    let cancelled = false;
    api
      .get<SessionAdmin>("/auth/me")
      .then(({ data }) => {
        if (!cancelled && data?.id) setAdmin(data);
      })
      .catch(() => {
        /* keep persisted session; next 401 refresh handles expiry */
      });
    return () => {
      cancelled = true;
    };
  }, [token, isHydrated, setAdmin]);

  if (!isHydrated || !ready) {
    return (
      <>
        <UiStyleScope />
        <PanelBootSplash />
      </>
    );
  }

  return (
    <div
      className={clsx(
        "hm-shell pwa-shell flex h-dvh flex-col overflow-hidden bg-slate-50 dark:bg-zinc-950",
        !topNav && "md:flex-row",
      )}
    >
      <UiStyleScope />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-700 focus:shadow-md dark:focus:bg-zinc-900 dark:focus:text-blue-300"
      >
        {t("nav.skipToContent")}
      </a>
      <TimezoneBootstrap />
      {topNav ? <ModernTopNav /> : <Sidebar />}
      <MobileNav />
      <main id="main-content" className="pwa-main relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 pb-8 md:p-8 md:pb-8">
        <div className="hm-page">{children}</div>
      </main>
      <PwaBottomNav />
      <InstallPrompt />
      <Toaster />
    </div>
  );
}

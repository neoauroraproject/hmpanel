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
import { useT } from "@/i18n";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const setAdmin = useAuth((s) => s.setAdmin);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const [isHydrated, setIsHydrated] = useState(false);
  const t = useT();

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

  if (!isHydrated || !ready) return <PanelBootSplash />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-zinc-950 md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-700 focus:shadow-md dark:focus:bg-zinc-900 dark:focus:text-blue-300"
      >
        {t("nav.skipToContent")}
      </a>
      <TimezoneBootstrap />
      <Sidebar />
      <MobileNav />
      <main id="main-content" className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 pb-8 md:p-8 md:pb-8">
        {children}
      </main>
      <Toaster />
    </div>
  );
}

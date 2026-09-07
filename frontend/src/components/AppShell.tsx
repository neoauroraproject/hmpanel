"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/store/auth";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Toaster } from "@/components/toast";
import { TimezoneBootstrap } from "@/components/TimezoneBootstrap";
import { PanelBootSplash } from "@/components/PanelLogo";
import { useT } from "@/i18n";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const [isHydrated, setIsHydrated] = useState(false);
  const t = useT();

  useEffect(() => {
    useAuth.persist.onFinishHydration(() => setIsHydrated(true));
    setIsHydrated(useAuth.persist.hasHydrated());
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    if (!token) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [token, router, pathname, isHydrated]);

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
      <main id="main-content" className="relative flex-1 overflow-y-auto p-4 pb-8 md:p-8 md:pb-8">
        {children}
      </main>
      <Toaster />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/store/auth";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Toaster } from "@/components/toast";
import { TimezoneBootstrap } from "@/components/TimezoneBootstrap";
import { PanelBootSplash } from "@/components/PanelLogo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const [isHydrated, setIsHydrated] = useState(false);

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
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950 md:flex-row">
      <TimezoneBootstrap />
      <Sidebar />
      <MobileNav />
      <main className="relative flex-1 overflow-y-auto p-4 pb-8 md:p-8 md:pb-8">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
